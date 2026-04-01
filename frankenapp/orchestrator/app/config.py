from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    kobold_url: str = "http://koboldcpp:5001"
    comfy_url: str = "http://comfyui:8188"
    cards_dir: str = "/cards"
    state_dir: str = "/state"
    graphs_dir: str = "/graphs"

    # Generation defaults
    default_max_length: int = 300
    cache_ttl_seconds: int = 60


settings = Settings()
