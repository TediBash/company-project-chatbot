# test_memory.py
import asyncio
from app.pipeline.memory import ShortTermMemoryProvider, RoadmapMemoryProvider, TokenOptimizer

async def test_components():
    # Test 1: Token Optimizer in isolation
    optimizer = TokenOptimizer()
    tokens = optimizer.count_tokens("Testing capping head error code E-404")
    print(f"Token Count: {tokens}")

    # Test 2: Roadmap Formatting in isolation
    roadmap_provider = RoadmapMemoryProvider()
    mock_data = {
        "objective": "Replace Capping Head Seal",
        "steps": [
            {"task": "Depressurize line", "status": "completed"},
            {"task": "Remove casing", "status": "pending"}
        ]
    }
    block = roadmap_provider.format_system_prompt_block(mock_data)
    print("Formatted Roadmap Block:\n", block)

if __name__ == "__main__":
    asyncio.run(test_components())