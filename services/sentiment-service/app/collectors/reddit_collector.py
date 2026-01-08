import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.models.schemas import (
    CollectedNewsDocument,
    CollectionResult,
    DataSourceType,
    RedditPost,
)

logger = logging.getLogger(__name__)


class RedditCollector:

    def __init__(self) -> None:
        self._reddit = None
        self._initialized = False

    async def _get_reddit_client(self):
        if self._reddit is not None:
            return self._reddit

        if not settings.reddit_client_id or not settings.reddit_client_secret:
            raise RuntimeError(
                "Reddit API credentials not configured. "
                "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables."
            )

        try:
            import praw

            self._reddit = praw.Reddit(
                client_id=settings.reddit_client_id,
                client_secret=settings.reddit_client_secret,
                user_agent=settings.reddit_user_agent,
            )
            self._initialized = True
            logger.info("Reddit client initialized successfully")
            return self._reddit

        except ImportError:
            raise RuntimeError(
                "PRAW library not installed. Run: pip install praw"
            )

    async def collect_posts(
        self,
        subreddits: Optional[list[str]] = None,
        limit: Optional[int] = None,
        time_filter: str = "day",
    ) -> list[RedditPost]:
        reddit = await self._get_reddit_client()
        
        subreddits = subreddits or settings.reddit_subreddits_list
        limit = limit or settings.reddit_post_limit
        
        collected_posts: list[RedditPost] = []
        
        for subreddit_name in subreddits:
            try:
                logger.info(f"Collecting posts from r/{subreddit_name}")
                
                # Run synchronous PRAW code in thread pool
                posts = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self._fetch_subreddit_posts(
                        reddit, subreddit_name, limit, time_filter
                    )
                )
                
                collected_posts.extend(posts)
                logger.info(f"Collected {len(posts)} posts from r/{subreddit_name}")
                
            except Exception as e:
                logger.error(f"Error collecting from r/{subreddit_name}: {e}")
                continue
        
        return collected_posts

    def _fetch_subreddit_posts(
        self,
        reddit,
        subreddit_name: str,
        limit: int,
        time_filter: str,
    ) -> list[RedditPost]:
        posts = []
        subreddit = reddit.subreddit(subreddit_name)
        
        # Get top posts from the time period
        for submission in subreddit.top(time_filter=time_filter, limit=limit):
            try:
                # Skip if no meaningful content
                content = submission.selftext or ""
                if not content and not submission.title:
                    continue
                
                post = RedditPost(
                    post_id=submission.id,
                    subreddit=subreddit_name,
                    title=submission.title,
                    content=content if content else submission.title,
                    author=str(submission.author) if submission.author else "[deleted]",
                    url=f"https://reddit.com{submission.permalink}",
                    score=submission.score,
                    num_comments=submission.num_comments,
                    created_utc=datetime.fromtimestamp(
                        submission.created_utc, tz=timezone.utc
                    ),
                    flair=submission.link_flair_text,
                )
                posts.append(post)
                
            except Exception as e:
                logger.warning(f"Error parsing submission {submission.id}: {e}")
                continue
        
        return posts

    async def collect_and_store(
        self,
        subreddits: Optional[list[str]] = None,
        limit: Optional[int] = None,
        time_filter: str = "day",
    ) -> CollectionResult:
        import time
        from app.database import Database
        
        start_time = time.time()
        errors: list[str] = []
        new_count = 0
        
        try:
            posts = await self.collect_posts(subreddits, limit, time_filter)
            
            # Store in database
            collection = Database.get_collection("collected_news")
            
            for post in posts:
                try:
                    # Check for duplicates
                    existing = await collection.find_one({
                        "source": DataSourceType.REDDIT.value,
                        "source_id": post.post_id
                    })
                    
                    if existing:
                        continue
                    
                    # Create document
                    doc = CollectedNewsDocument(
                        source=DataSourceType.REDDIT,
                        source_id=post.post_id,
                        title=post.title,
                        content=post.content,
                        link=post.url,
                        published_at=post.created_utc,
                        metadata={
                            "subreddit": post.subreddit,
                            "author": post.author,
                            "score": post.score,
                            "num_comments": post.num_comments,
                            "flair": post.flair,
                        }
                    )
                    
                    await collection.insert_one(doc.model_dump())
                    new_count += 1
                    
                except Exception as e:
                    errors.append(f"Error storing post {post.post_id}: {str(e)}")
            
            duration = time.time() - start_time
            
            return CollectionResult(
                source=DataSourceType.REDDIT,
                collected_count=len(posts),
                new_count=new_count,
                analyzed_count=0,
                errors=errors,
                duration_seconds=round(duration, 2)
            )
            
        except Exception as e:
            duration = time.time() - start_time
            errors.append(f"Collection failed: {str(e)}")
            
            return CollectionResult(
                source=DataSourceType.REDDIT,
                collected_count=0,
                new_count=0,
                errors=errors,
                duration_seconds=round(duration, 2)
            )

    def is_configured(self) -> bool:
        """Check if Reddit credentials are configured."""
        return bool(settings.reddit_client_id and settings.reddit_client_secret)


# Mock collector for development without Reddit credentials
class MockRedditCollector(RedditCollector):
    """Mock Reddit collector for testing without API credentials."""

    async def collect_posts(
        self,
        subreddits: Optional[list[str]] = None,
        limit: Optional[int] = None,
        time_filter: str = "day",
    ) -> list[RedditPost]:
        """Return mock Reddit posts for testing."""
        from datetime import timedelta
        import random
        
        mock_posts = [
            {
                "title": "Bitcoin breaks $100k! This is huge for crypto adoption",
                "content": "After years of waiting, Bitcoin has finally broken the $100,000 barrier. Institutional investors are piling in and the future looks bright for cryptocurrency.",
                "subreddit": "cryptocurrency",
                "score": 15420,
            },
            {
                "title": "Ethereum 2.0 staking rewards looking very promising",
                "content": "The staking APY on ETH 2.0 is currently around 5%. With the merge complete, Ethereum is more energy efficient and sustainable than ever.",
                "subreddit": "ethereum",
                "score": 8750,
            },
            {
                "title": "Warning: New phishing scam targeting crypto wallets",
                "content": "Be careful! There's a new scam going around where fake wallet apps steal your seed phrases. Always download from official sources only.",
                "subreddit": "cryptocurrency",
                "score": 12300,
            },
            {
                "title": "Solana network congestion causing transaction delays",
                "content": "The Solana network is experiencing high congestion today. Transactions are taking longer than usual and fees have increased slightly.",
                "subreddit": "solana",
                "score": 3200,
            },
            {
                "title": "BNB Chain announces major upgrade for Q1 2026",
                "content": "Binance Smart Chain is getting a major performance upgrade that will increase TPS by 10x and reduce gas fees significantly.",
                "subreddit": "binance",
                "score": 5600,
            },
        ]
        
        posts = []
        now = datetime.now(timezone.utc)
        
        for i, mock in enumerate(mock_posts[:limit or 5]):
            posts.append(RedditPost(
                post_id=f"mock_{i}_{int(now.timestamp())}",
                subreddit=mock["subreddit"],
                title=mock["title"],
                content=mock["content"],
                author=f"crypto_user_{random.randint(1000, 9999)}",
                url=f"https://reddit.com/r/{mock['subreddit']}/comments/mock{i}",
                score=mock["score"],
                num_comments=random.randint(50, 500),
                created_utc=now - timedelta(hours=random.randint(1, 24)),
                flair="Discussion",
            ))
        
        logger.info(f"Generated {len(posts)} mock Reddit posts")
        return posts
