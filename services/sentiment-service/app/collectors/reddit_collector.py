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

    def __init__(self):
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
            raise RuntimeError("PRAW library not installed. Run: pip install praw")

    async def collect_posts(
        self,
        subreddits = None,
        limit = None,
        time_filter = "day",
    ):
        reddit = await self._get_reddit_client()
        
        subreddits = subreddits or settings.reddit_subreddits_list
        limit = limit or settings.reddit_post_limit
        
        collected_posts = []
        
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
        subreddit_name,
        limit,
        time_filter,
    ):
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
        subreddits = None,
        limit = None,
        time_filter = "day",
    ):
        import time
        from app.database import Database
        
        start_time = time.time()
        errors = []
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

    def is_configured(self):
        """Check if Reddit credentials are configured."""
        return bool(settings.reddit_client_id and settings.reddit_client_secret)