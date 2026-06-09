from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/fraud_detect"
    REDIS_URL: str = "redis://localhost:6379/0"

    RISK_THRESHOLD: int = 70
    BLOCK_THRESHOLD: int = 90
    ESCALATION_MINUTES: int = 10
    ESCALATION_COUNT: int = 3

    APP_NAME: str = "Fraud Detection API"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False


settings = Settings()
