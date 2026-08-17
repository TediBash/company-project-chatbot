# app/prompts/registry.py
import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional
from jinja2 import Environment, meta, StrictUndefined
from app.prompts.schemas import VersionedPrompt, RenderedPrompt

PROMPTS_DIR = Path(__file__).parent / "templates"

class PromptRegistry:
    def __init__(self):
        self._prompts: Dict[str, Dict[str, VersionedPrompt]] = {}
        # StrictUndefined ensures the prompt fails loudly if a variable is missing
        self._jinja_env = Environment(undefined=StrictUndefined)
        self._load_all_prompts()

    def _load_all_prompts(self):
        """Scans the templates directory and loads all .yaml prompt files."""
        if not PROMPTS_DIR.exists():
            PROMPTS_DIR.mkdir(parents=True)

        for filepath in PROMPTS_DIR.glob("*.yaml"):
            with open(filepath, "r", encoding="utf-8") as file:
                try:
                    data = yaml.safe_load(file)
                    prompt = VersionedPrompt(**data)
                    
                    if prompt.name not in self._prompts:
                        self._prompts[prompt.name] = {}
                        
                    self._prompts[prompt.name][prompt.version] = prompt
                except Exception as e:
                    print(f"[Registry Error] Failed to load {filepath.name}: {e}")

    def _render_template(self, template_str: str, variables: Dict[str, Any]) -> str:
        if not template_str:
            return ""
        template = self._jinja_env.from_string(template_str)
        return template.render(**variables)

    def render(self, name: str, variables: Dict[str, Any], version: Optional[str] = None) -> RenderedPrompt:
        """
        Fetches and renders a prompt. 
        If version is None, it defaults to the highest version number available.
        """
        if name not in self._prompts:
            raise ValueError(f"Prompt family '{name}' not found in registry.")

        available_versions = self._prompts[name]
        
        if version:
            if version not in available_versions:
                raise ValueError(f"Version '{version}' not found for prompt '{name}'.")
            target_prompt = available_versions[version]
        else:
            # Default to the latest version by sorting the semantic version strings
            latest_version = sorted(available_versions.keys())[-1]
            target_prompt = available_versions[latest_version]

        # Render the Jinja2 templates
        rendered_sys = self._render_template(target_prompt.system_prompt, variables)
        rendered_user = self._render_template(target_prompt.user_prompt or "", variables)

        return RenderedPrompt(
            name=target_prompt.name,
            version=target_prompt.version,
            system_message=rendered_sys,
            user_message=rendered_user,
            model_defaults=target_prompt.model_defaults
        )

# Global singleton
prompt_registry = PromptRegistry()