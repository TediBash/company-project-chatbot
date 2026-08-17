# app/database.py
import asyncpg
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from app.config import settings

class Database:
    def __init__(self):
        self.pool = None

    async def connect(self):
        """Initializes the connection pool on server startup."""
        self.pool = await asyncpg.create_pool(
            dsn=settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=60
        )
        print("✅ PostgreSQL Connection Pool Initialized")

    async def disconnect(self):
        """Closes the pool gracefully on server shutdown."""
        if self.pool:
            await self.pool.close()
            print("🛑 PostgreSQL Connection Pool Closed")

    @asynccontextmanager
    async def tenant_connection(self, company_id: str) -> AsyncGenerator[asyncpg.Connection, None]:
        """
        Yields a secure connection isolated to the specific company.
        This enforces your database Row-Level Security (RLS).
        """
        if not self.pool:
            raise RuntimeError("Database pool is not initialized")

        async with self.pool.acquire() as connection:
            async with connection.transaction():
                # Inject the RLS context using set_config (Safe for parameter binding)
                # set_config('setting_name', 'new_value', is_local)
                # is_local = True ensures it only applies to this specific transaction
                await connection.execute(
                    "SELECT set_config('app.current_tenant', $1, true);", 
                    company_id
                )
                yield connection

# Global singleton instance
db = Database()