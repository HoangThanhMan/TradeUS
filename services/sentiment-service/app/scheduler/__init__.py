"""
Scheduler module for automated data collection.
Provides background task scheduling for periodic news collection.
"""

from app.scheduler.collector_scheduler import CollectorScheduler, get_scheduler

__all__ = ["CollectorScheduler", "get_scheduler"]
