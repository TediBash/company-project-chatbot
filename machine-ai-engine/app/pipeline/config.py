# app/pipeline/config.py
import yaml
from pathlib import Path
from pydantic import BaseModel, Field

class MemoryConfig(BaseModel):
    short_term_enabled: bool = Field(default=True, description="Fetch recent messages")
    long_term_enabled: bool = Field(default=False, description="Summarize older messages")
    roadmap_enabled: bool = Field(default=True, description="Inject Stateful JSON procedure")
    max_history_messages: int = Field(default=10, description="Max messages for short-term window")

class RAGConfig(BaseModel):
    enabled: bool = Field(default=True, description="Use Vector Search for Technical Manuals")
    top_k: int = Field(default=3, description="Number of manual snippets to retrieve")
    reranking_enabled: bool = Field(default=False, description="Use cross-encoder to sort vectors")

class BudgetConfig(BaseModel):
    max_iterations_per_answer: int = Field(default=3, description="Max attempts if Critic says NO")
    max_tokens_per_answer: int = Field(default=4000, description="Max output tokens allowed per turn")
    max_cost_per_answer: float = Field(default=0.05, description="Max cost in USD allowed per turn")

class ControlPlaneConfig(BaseModel):
    guardrails_enabled: bool = Field(default=True, description="Run safety checks on input/output")
    validate_response_enabled: bool = Field(default=True, description="Enable the Critic Agent")
    use_intent_router: bool = Field(default=True, description="Route to specific agents dynamically")

class PipelineConfig(BaseModel):
    """The master configuration for the AI Engine's Cognitive Loop."""
    memory: MemoryConfig = MemoryConfig()
    rag: RAGConfig = RAGConfig()
    budget: BudgetConfig = BudgetConfig()
    control: ControlPlaneConfig = ControlPlaneConfig()

    @classmethod
    def load_from_yaml(cls, path: str | Path) -> "PipelineConfig":
        """Loads and validates the configuration from a YAML file."""
        file_path = Path(path)
        if not file_path.exists():
            print(f"⚠️ Warning: Config file {file_path.name} not found. Using default settings.")
            return cls()
            
        with open(file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            
        return cls(**data)

# Load the active configuration globally (we will create this yaml file next)
CONFIG_PATH = Path(__file__).parent.parent.parent / "pipeline_config.yaml"
active_pipeline = PipelineConfig.load_from_yaml(CONFIG_PATH)