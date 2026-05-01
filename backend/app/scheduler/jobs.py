from apscheduler.schedulers.background import BackgroundScheduler

from app.workers.enqueue import enqueue_gemini_analysis_jobs, enqueue_ingestion_jobs

scheduler = BackgroundScheduler()


def configure_scheduler() -> None:
    scheduler.add_job(enqueue_ingestion_jobs, "interval", seconds=60, id="ingestion-poll", replace_existing=True)
    scheduler.add_job(
        enqueue_gemini_analysis_jobs,
        "interval",
        minutes=5,
        id="gemini-analysis",
        replace_existing=True,
    )


def start_scheduler() -> None:
    if not scheduler.running:
        configure_scheduler()
        scheduler.start()
        enqueue_ingestion_jobs()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
