
---

# AROL Industrial Platform - Master Setup & Execution Guide



The AROL Industrial Platform is a premium, multi-tenant web application designed for machinery management, telemetry monitoring, and AI-driven commercial operations. This master document provides the necessary steps to configure the environment from scratch and execute the complete system locally.

## 📂 Project Architecture



The repository is divided into three primary microservices. **Please note: Each of these folders contains its own dedicated `README.md` file detailing specific `.env` variables and configuration settings required for that specific module.**

* `machine-chatbot/` **(Frontend):** The React/Vite UI client.


* `machine-backend/` **(Backend):** The Node.js REST API server.


* `machine-ai-engine/` **(AI Engine):** The Python-based multi-agent orchestration service.



---

## 🚀 Quick Start: System Execution



If you have already configured the environment and installed all dependencies, follow these steps to turn on the system. You will need three separate terminal windows.

**Step 1: Database Check**


Ensure your PostgreSQL database and pgAdmin services are actively running in the background.

**Step 2: Start the Backend**


Open your first terminal and execute:

```bash
cd machine-backend
npm run dev

```

**Step 3: Start the Frontend**


Open your second terminal and execute:

```bash
cd machine-chatbot
npm run dev

```

**Step 4: Start Ollama**
Ensure that the Ollama service is actively running in the background to serve the local LLMs. You can verify this by checking your system tray/menu bar for the Ollama icon or by running `ollama list` in a new terminal window to ensure the service responds and `llama3` is listed.

**Step 5: Start the AI Engine**


Open an Anaconda prompt, activate your virtual environment, and execute:

```bash
# Activate your environment (e.g., conda activate arol-ai)
cd machine-ai-engine
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

```

**Step 6: Access the Platform**

* Open your web browser and navigate to: `http://localhost:5173/`
* **System Administrator Credentials:**
    * **Email:** `admin@arol.com`
    * **Password:** `admin123`

**The tenant domain can be found on the Tenant Management page of the admin@arol.com superuser account.**

* **Tenant Administrator Credentials:** For each tenant on the platform, an administrative user is defined as:
    * **Email:** `admin@<tenant-domain>.com`
    * **Password:** `admin123`


* **Pre-Configured Test Accounts (Valgrande Bevande S.p.A.):**
To inspect pre-existing conversation histories and reproduce the test cases documented in the technical report, you can log in with either of the following user accounts:
    * **Technician Role:** `serena.lupo@valgrande-bevande.com` (Password: `admin123`)
    * **Commercial Role:** `davide.ranieri@valgrande-bevande.com` (Password: `admin123`)
*(Note: Both accounts contain pre-populated chat sessions from which the verification tests and report captures were generated).*

---

## 🛠 Installation Guide (From Scratch)



Follow these steps sequentially to set up the system on a fresh machine.

### Phase 1: Database Initialization



The platform utilizes Row-Level Security (RLS) data isolation and Role-Based Access Control (RBAC).

1. Install **PostgreSQL 18** and **pgAdmin4** *(If you need assistance, a complete installation guide is available at the end of this document in **Phase 6**)*.


2. Open pgAdmin4 and create a new database named exactly: `MachineChatbot`.


3. Right-click the newly created `MachineChatbot` database and select **Restore**.


4. Select the provided `AROL_DB_init.sql` file and execute the restore process. This will initialize all required schemas, tables, and seed the entire database content.



### Phase 2: Frontend Setup



Navigate to the frontend directory and install the Node modules:

```bash
cd machine-chatbot
npm install

```

*(Wait for the installation to complete).*

### Phase 3: Backend Setup



Navigate to the backend directory and install the Node modules:

```bash
cd machine-backend
npm install

```

### Phase 4: Ollama & Llama3 Setup

The AI multi-agent orchestrator relies on local LLM inference.

1. **Install Ollama:** Download and install the Ollama application for your specific operating system from the official website ([https://ollama.com](https://ollama.com)).
2. **Download the Llama3 Model:** Once Ollama is installed and running, open a terminal and execute the following command to pull the required model:

```bash
ollama pull llama3

```

### Phase 5: AI Engine Setup

The AI multi-agent orchestrator requires a specific Python environment. Using Anaconda, execute the following commands to create the environment and install dependencies:

```bash
cd machine-ai-engine
conda create --name arol-ai python=3.11.9
conda activate arol-ai
pip install -r requirements.txt --ignore-installed


```

For security, execute this manual `pip install` list in case something from the `requirements.txt` installation was missed. New installations:

```bash
pip install asyncpg
pip install uvicorn
pip install fastapi
pip install pydantic_settings
pip install httpx
pip install sse_starlette
pip install sqlalchemy
pip install pyyaml
pip install pymupdf
pip install langchain_text_splitters
pip install chromadb
pip install litellm
pip install pandas
pip install datasets --force-reinstall
pip install sentence_transformers

```

### Phase 6: PostgreSQL 18 & pgAdmin4 Installation Guide



If you do not have PostgreSQL 18 installed on your machine, follow these steps:

#### For Windows & macOS



1. **Download the Installer:** Visit the official PostgreSQL EnterpriseDB download page ([https://www.enterprisedb.com/downloads/postgres-postgresql-downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads)).


2. **Select Version:** Choose the installer for **PostgreSQL version 18** that matches your operating system.


3. **Run the Setup Wizard:** Launch the downloaded installer.


4. **Select Components:** When prompted to select components, ensure that both **PostgreSQL Server** and **pgAdmin 4** are checked. (Command Line Tools are also recommended).


5. **Set Password:** You will be asked to create a password for the default database superuser (`postgres`). **Make sure to remember this password**, as you will need it to log into pgAdmin4 and configure your `.env` files.


6. **Port Configuration:** Leave the default port set to `5432` unless you have a specific conflict on your machine.


7. **Complete Installation:** Proceed through the rest of the wizard using the default settings and click "Finish".


8. **Launch pgAdmin:** Open your applications menu, launch pgAdmin 4, and log in using the `postgres` password you just created. You are now ready to return to **Phase 1, Step 2**.



#### For Linux (Ubuntu/Debian)



1. **Add the PostgreSQL Repository:**


```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

```

2. **Install PostgreSQL 18 & pgAdmin4:**


```bash
sudo apt update
sudo apt install postgresql-18 pgadmin4

```

3. **Verify the Service:** Ensure the database is running:



```bash
sudo systemctl status postgresql

```