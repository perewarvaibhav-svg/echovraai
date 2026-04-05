# ☁️ Setting Up The Cloud Database (Supabase)

To make your project scale and prove to judges that you have a persistent backend log, we Integrated **Supabase** (an open-source Firebase/PostgreSQL alternative).

It logs every transcribed audio, its computed emotion, and the neural confidence score into a SQL database automatically.

Here is how to set it up in 2 minutes:

### 1. Create the Database
1. Go to [Supabase](https://supabase.com/) and click **Start your project** (it's free).
2. Create a new project. Name it `voice-emotion-db` or similar.
3. Once the dashboard loads, navigate to the **SQL Editor** on the left menu.

### 2. Run the Table Setup Script
Copy and paste this exact SQL query into the editor and hit **Run**:

```sql
CREATE TABLE voice_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    transcript TEXT NOT NULL,
    emotion TEXT NOT NULL,
    confidence NUMERIC NOT NULL
);
```
*(This instantly creates the exact table our code expects.)*

### 3. Connect Your Node.js App
1. In the Supabase menu, go to **Project Settings** (the gear icon) ➡️ **API**.
2. Look for your **Project URL**. Copy it.
3. Look for your **Project API Keys** (the `anon` / `public` key). Copy it.
4. Open your `.env` file in VS Code and add them exactly like this:

```
SUPABASE_URL=https://your-custom-url.supabase.co
SUPABASE_KEY=your.massive.eyJh...token...string
```

### 4. You Are Done!
Save your `.env` file. The Node.js Express backend will automatically detect the database keys on the next `/analyze` request and begin streaming logs directly to the cloud Postgres database.

You can view your logs by navigating back to Supabase and clicking the **Table Editor** menu!
