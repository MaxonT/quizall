/**
 * PostgreSQL Database Connection
 * Alternative to SQLite for production environments
 */

import pg from 'pg';
const { Pool } = pg;

// Parse DATABASE_URL or construct from individual components
const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'quizall',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  };
};

const pool = new Pool(getDatabaseConfig());

// Test connection
pool.on('error', (err) => {
  console.error('[quizall] Unexpected PostgreSQL pool error:', err);
});

// Database query wrapper to match SQLite API
export const db = {
  // Execute a query and return results
  async query(sql, params = []) {
    try {
      // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ...
      let pgSql = sql;
      const pgParams = [];
      
      if (params && params.length > 0) {
        let paramIndex = 1;
        pgSql = sql.replace(/\?/g, () => {
          pgParams.push(params[paramIndex - 1]);
          return `$${paramIndex++}`;
        });
      }

      const result = await pool.query(pgSql, pgParams);
      return result.rows;
    } catch (err) {
      console.error('[quizall] PostgreSQL query error:', err);
      throw err;
    }
  },

  // Execute a query and return first row (like SQLite .get())
  async get(sql, ...params) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  },

  // Execute a query and return all rows (like SQLite .all())
  async all(sql, ...params) {
    return await this.query(sql, params);
  },

  // Execute a query without returning results (like SQLite .run())
  async run(sql, ...params) {
    await this.query(sql, params);
    return { changes: 0, lastInsertRowid: null }; // Mock SQLite return format
  },

  // Execute multiple statements (like SQLite .exec())
  async exec(sql) {
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim());
    for (const statement of statements) {
      if (statement.trim()) {
        await this.query(statement);
      }
    }
  },

  // Transaction support
  async transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback({
        query: async (sql, params) => {
          let pgSql = sql;
          const pgParams = [];
          
          if (params && params.length > 0) {
            let paramIndex = 1;
            pgSql = sql.replace(/\?/g, () => {
              pgParams.push(params[paramIndex - 1]);
              return `$${paramIndex++}`;
            });
          }

          const result = await client.query(pgSql, pgParams);
          return result.rows;
        },
        get: async (sql, ...params) => {
          const rows = await this.query(sql, params, client);
          return rows[0] || null;
        },
        run: async (sql, ...params) => {
          await this.query(sql, params, client);
          return { changes: 0 };
        }
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Prepared statement support (sync-style API for better-sqlite3 compatibility)
  prepare(sql) {
    return {
      get: (...params) => {
        return this.get(sql, ...params);
      },
      all: (...params) => {
        return this.all(sql, ...params);
      },
      run: (...params) => {
        return this.run(sql, ...params);
      }
    };
  },

  // Close connection pool
  async close() {
    await pool.end();
  }
};

// Initialize database schema
export async function initializeSchema() {
  const schema = `
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(255) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT,
      oauth_provider VARCHAR(50),
      oauth_id VARCHAR(255),
      subscription_tier VARCHAR(50) DEFAULT 'free',
      subscription_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
    );

    -- Docs table
    CREATE TABLE IF NOT EXISTS docs (
      id VARCHAR(255) PRIMARY KEY,
      owner_id VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_docs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    -- Shares table
    CREATE TABLE IF NOT EXISTS shares (
      id VARCHAR(255) PRIMARY KEY,
      doc_id VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL,
      mode VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      CONSTRAINT fk_shares_doc FOREIGN KEY (doc_id) REFERENCES docs(id)
    );

    -- Specs table
    CREATE TABLE IF NOT EXISTS specs (
      id VARCHAR(255) PRIMARY KEY,
      owner_id VARCHAR(255) NOT NULL,
      project_id VARCHAR(255),
      session_id VARCHAR(255),
      kind VARCHAR(50),
      title VARCHAR(255) NOT NULL,
      summary TEXT,
      tech_stack TEXT,
      pages TEXT,
      data_model TEXT,
      constraints TEXT,
      spec_json TEXT NOT NULL,
      status VARCHAR(50) DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      completeness_score REAL DEFAULT 0.0,
      raw_idea TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_specs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    -- Compiled prompts table
    CREATE TABLE IF NOT EXISTS compiled_prompts (
      id VARCHAR(255) PRIMARY KEY,
      spec_id VARCHAR(255) NOT NULL,
      compiled_json TEXT NOT NULL,
      explanation TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cp_spec FOREIGN KEY (spec_id) REFERENCES specs(id)
    );

    -- Question sessions table
    CREATE TABLE IF NOT EXISTS question_sessions (
      id VARCHAR(255) PRIMARY KEY,
      owner_id VARCHAR(255),
      initial_description TEXT NOT NULL,
      kind VARCHAR(50),
      mode VARCHAR(50) DEFAULT 'deep',
      model VARCHAR(100) DEFAULT 'quizall',
      language VARCHAR(10) DEFAULT 'en',
      status VARCHAR(50) NOT NULL,
      intent_json TEXT,
      spec_json TEXT,
      compiled_prompt_json TEXT,
      explanation TEXT,
      step INTEGER DEFAULT 0,
      is_complete BOOLEAN DEFAULT false,
      spec_id VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_qs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    -- Question questions table
    CREATE TABLE IF NOT EXISTS question_questions (
      id VARCHAR(255) PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      options_json TEXT,
      order_index INTEGER NOT NULL,
      CONSTRAINT fk_qq_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
    );

    -- Question answers table
    CREATE TABLE IF NOT EXISTS question_answers (
      id VARCHAR(255) PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      question_id VARCHAR(255) NOT NULL,
      answer_json TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_qa_session FOREIGN KEY (session_id) REFERENCES question_sessions(id),
      CONSTRAINT fk_qa_question FOREIGN KEY (question_id) REFERENCES question_questions(id)
    );

    -- Runs table
    CREATE TABLE IF NOT EXISTS runs (
      id VARCHAR(255) PRIMARY KEY,
      spec_id VARCHAR(255),
      spec_version VARCHAR(50),
      model VARCHAR(100),
      status VARCHAR(50) NOT NULL,
      input_blocks TEXT,
      raw_output TEXT,
      completed_at TIMESTAMP,
      metrics_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Run errors table
    CREATE TABLE IF NOT EXISTS run_errors (
      id VARCHAR(255) PRIMARY KEY,
      run_id VARCHAR(255) NOT NULL,
      error_type VARCHAR(100),
      details TEXT,
      detected_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_re_run FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    -- Evaluations table
    CREATE TABLE IF NOT EXISTS evaluations (
      id VARCHAR(255) PRIMARY KEY,
      spec_id VARCHAR(255) NOT NULL,
      compiled_prompt_id VARCHAR(255) NOT NULL,
      run_id VARCHAR(255),
      model VARCHAR(100),
      score REAL,
      verdict VARCHAR(50),
      summary TEXT,
      details TEXT,
      metrics_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_eval_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
      CONSTRAINT fk_eval_cp FOREIGN KEY (compiled_prompt_id) REFERENCES compiled_prompts(id),
      CONSTRAINT fk_eval_run FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    -- Question snapshots table
    CREATE TABLE IF NOT EXISTS question_snapshots (
      id VARCHAR(255) PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_snapshot_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
    );

    -- Question actions table
    CREATE TABLE IF NOT EXISTS question_actions (
      id VARCHAR(255) PRIMARY KEY,
      session_id VARCHAR(255) NOT NULL,
      action VARCHAR(50) NOT NULL,
      payload TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_action_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
    );

    -- Outcome runs table
    CREATE TABLE IF NOT EXISTS outcome_runs (
      id VARCHAR(255) PRIMARY KEY,
      spec_id VARCHAR(255),
      run_id VARCHAR(255),
      task TEXT NOT NULL,
      input TEXT,
      style TEXT,
      constraints TEXT,
      n INTEGER NOT NULL,
      model VARCHAR(100),
      status VARCHAR(50) NOT NULL,
      best_candidate_id VARCHAR(255),
      request_json TEXT,
      result_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_outcome_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
      CONSTRAINT fk_outcome_run FOREIGN KEY (run_id) REFERENCES runs(id)
    );

    -- Outcome candidates table
    CREATE TABLE IF NOT EXISTS outcome_candidates (
      id VARCHAR(255) PRIMARY KEY,
      outcome_run_id VARCHAR(255) NOT NULL,
      candidate_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      llm_score REAL,
      final_score REAL,
      tests_passed INTEGER,
      tests_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cand_outcome FOREIGN KEY (outcome_run_id) REFERENCES outcome_runs(id)
    );

    -- Candidate prompts table
    CREATE TABLE IF NOT EXISTS candidate_prompts (
      id VARCHAR(255) PRIMARY KEY,
      spec_id VARCHAR(255) NOT NULL,
      session_id VARCHAR(255),
      agent VARCHAR(100) NOT NULL,
      model VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      clarity REAL,
      coherence REAL,
      style_match REAL,
      safety REAL,
      token_cost INTEGER,
      risk REAL,
      pass_rate REAL,
      f1_score REAL,
      composite_score REAL,
      metrics_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_cp_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
      CONSTRAINT fk_cp_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
    );

    -- Plan usage table
    CREATE TABLE IF NOT EXISTS plan_usage (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      feature_type VARCHAR(50) NOT NULL,
      date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Timezone-aware daily refresh tracking
    CREATE TABLE IF NOT EXISTS user_daily_refresh_tracker (
      user_id VARCHAR(255) PRIMARY KEY,
      last_daily_refresh_date VARCHAR(10) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tracker_updated ON user_daily_refresh_tracker(updated_at);

    -- Analytics tables
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      event VARCHAR(100) NOT NULL,
      user_id VARCHAR(255),
      session_id VARCHAR(255),
      properties TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics_users (
      id VARCHAR(255) PRIMARY KEY,
      source VARCHAR(100) DEFAULT 'organic',
      timezone VARCHAR(100),
      country VARCHAR(10),
      device_type VARCHAR(50),
      browser VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      session_start TIMESTAMP NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      page_views INTEGER DEFAULT 0,
      device_type VARCHAR(50),
      browser VARCHAR(50),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_analytics_session_user FOREIGN KEY (user_id) REFERENCES analytics_users(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_behavior (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      session_id VARCHAR(255),
      recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      mouse_movements INTEGER DEFAULT 0,
      scrolls INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      typing_events INTEGER DEFAULT 0,
      engagement_score REAL DEFAULT 0,
      CONSTRAINT fk_analytics_behavior_user FOREIGN KEY (user_id) REFERENCES analytics_users(id),
      CONSTRAINT fk_analytics_behavior_session FOREIGN KEY (session_id) REFERENCES analytics_sessions(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_daily (
      date DATE PRIMARY KEY,
      unique_users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 0,
      cumulative_users INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Quiz results
    CREATE TABLE IF NOT EXISTS quiz_results (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      subject TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      topics TEXT,
      elapsed INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_qr_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_results_user ON quiz_results(user_id, created_at);

    -- Quiz questions
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id VARCHAR(255) PRIMARY KEY,
      result_id VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      question TEXT NOT NULL,
      options TEXT,
      correct_answer TEXT NOT NULL,
      user_answer TEXT,
      is_correct BOOLEAN NOT NULL DEFAULT false,
      explanation TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT fk_qq_result FOREIGN KEY (result_id) REFERENCES quiz_results(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_questions_result ON quiz_questions(result_id);

    -- Quiz API usage logs
    CREATE TABLE IF NOT EXISTS quiz_api_logs (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      action VARCHAR(100) NOT NULL,
      model VARCHAR(100),
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      duration_ms INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_quiz_api_logs_user ON quiz_api_logs(user_id, created_at);

    -- Billing / subscriptions (parity with SQLite migrations 001–005)
    CREATE TABLE IF NOT EXISTS stripe_customers (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL UNIQUE,
      stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
      email VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_stripe_user FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers(user_id);
    CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe ON stripe_customers(stripe_customer_id);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      stripe_subscription_id VARCHAR(255) UNIQUE,
      stripe_customer_id VARCHAR(255),
      status VARCHAR(50) NOT NULL DEFAULT 'none',
      plan VARCHAR(50),
      price_id VARCHAR(255),
      period_start TIMESTAMP,
      period_end TIMESTAMP,
      trial_start TIMESTAMP,
      trial_end TIMESTAMP,
      cancel_at_period_end BOOLEAN DEFAULT false,
      canceled_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

    CREATE TABLE IF NOT EXISTS token_ledger (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      bucket VARCHAR(50) NOT NULL,
      tokens_change INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      expires_at TIMESTAMP,
      source VARCHAR(50) NOT NULL,
      reason TEXT,
      run_id VARCHAR(255),
      subscription_id VARCHAR(255),
      stripe_event_id VARCHAR(255),
      admin_actor VARCHAR(255),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_token_ledger_user ON token_ledger(user_id);
    CREATE INDEX IF NOT EXISTS idx_token_ledger_bucket ON token_ledger(user_id, bucket);
    CREATE INDEX IF NOT EXISTS idx_token_ledger_created ON token_ledger(created_at);

    CREATE TABLE IF NOT EXISTS token_balances_cache (
      user_id VARCHAR(255) PRIMARY KEY,
      daily_free_remaining INTEGER NOT NULL DEFAULT 0,
      monthly_remaining INTEGER NOT NULL DEFAULT 0,
      trial_base_remaining INTEGER NOT NULL DEFAULT 0,
      total_remaining INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_balance_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS stripe_events (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(255) NOT NULL UNIQUE,
      event_type VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      error TEXT,
      payload TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(event_id);

    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      stripe_session_id VARCHAR(255) UNIQUE,
      session_url TEXT,
      plan VARCHAR(50) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      idempotency_key VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_checkout_user FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user ON checkout_sessions(user_id);

    CREATE TABLE IF NOT EXISTS trial_abuse_checks (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      ip_address VARCHAR(100),
      device_fingerprint VARCHAR(255),
      email_domain VARCHAR(255),
      risk_score INTEGER DEFAULT 0,
      is_disposable_email BOOLEAN DEFAULT false,
      is_high_velocity_ip BOOLEAN DEFAULT false,
      is_duplicate_fingerprint BOOLEAN DEFAULT false,
      requires_payment_method BOOLEAN DEFAULT false,
      trial_blocked BOOLEAN DEFAULT false,
      blocked_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_abuse_user FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ip_rate_limits (
      ip_address VARCHAR(100) PRIMARY KEY,
      registration_count INTEGER NOT NULL DEFAULT 0,
      trial_count INTEGER NOT NULL DEFAULT 0,
      last_registration TIMESTAMP,
      last_trial TIMESTAMP,
      blocked_until TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) NOT NULL UNIQUE,
      plan VARCHAR(50) NOT NULL DEFAULT 'monthly',
      max_redemptions INTEGER NOT NULL DEFAULT 10,
      times_redeemed INTEGER NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL DEFAULT 30,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id SERIAL PRIMARY KEY,
      coupon_id INTEGER NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
      CONSTRAINT fk_coupon_user FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT uq_coupon_user UNIQUE (coupon_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS oauth_pkce_states (
      state VARCHAR(64) PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      provider VARCHAR(20) NOT NULL,
      return_origin TEXT,
      expires_at TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_oauth_pkce_expires ON oauth_pkce_states(expires_at);

    -- Pending quiz rounds (background generation recovery)
    CREATE TABLE IF NOT EXISTS pending_quiz_rounds (
      id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      round_config TEXT NOT NULL,
      questions TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pending_quiz_project ON pending_quiz_rounds(project_id, user_id);

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_plan_usage_user_date ON plan_usage(user_id, date, feature_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_users_created ON analytics_users(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start ON analytics_sessions(session_start);
    CREATE INDEX IF NOT EXISTS idx_analytics_behavior_recorded ON analytics_behavior(recorded_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);
  `;

  try {
    await db.exec(schema);
    await db.exec("ALTER TABLE question_sessions ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC';");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone_updated_at TIMESTAMP;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT false;");
    await db.exec("ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP;");
    await db.exec("ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS project_id VARCHAR(255);");
    await db.exec("ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS round_label TEXT;");
    // quiz_shares: migrate new columns (public library feature); DO block is a no-op on fresh DBs
    await db.run(`DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_shares') THEN
    ALTER TABLE quiz_shares ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE quiz_shares ADD COLUMN IF NOT EXISTS subject_category TEXT;
    ALTER TABLE quiz_shares ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$`);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_pkce_states (
        state VARCHAR(64) PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        provider VARCHAR(20) NOT NULL,
        return_origin TEXT,
        expires_at TIMESTAMP NOT NULL
      );
    `);
    await db.exec("CREATE INDEX IF NOT EXISTS idx_oauth_pkce_expires ON oauth_pkce_states(expires_at);");
    await db.run(
      `INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
       VALUES (?, 'monthly', 10, 30, true)
       ON CONFLICT (code) DO NOTHING`,
      ["QUIZALL-DEE1636310A6"]
    );
    // Ensure pending_quiz_rounds exists on pre-existing databases
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pending_quiz_rounds (
        id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        round_config TEXT NOT NULL,
        questions TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.exec("CREATE INDEX IF NOT EXISTS idx_pending_quiz_project ON pending_quiz_rounds(project_id, user_id);");
    console.log('[quizall] PostgreSQL schema initialized');
  } catch (err) {
    console.error('[quizall] Failed to initialize PostgreSQL schema:', err);
    throw err;
  }
}

// Ensure demo user exists
export async function ensureDemoUser() {
  try {
    await db.run(`
      INSERT INTO users (id, email, created_at)
      VALUES ('demo-user', 'demo@quizall.local', CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('[quizall] Demo user ensured');
  } catch (err) {
    console.error('[quizall] Failed to ensure demo user:', err);
  }
}

// Ensure user exists helper
export async function ensureUser(userId, email = null) {
  try {
    const userEmail = email || `${userId}@quizall.local`;
    await db.run(`
      INSERT INTO users (
        id,
        email,
        password_hash,
        subscription_tier,
        subscription_active,
        created_at,
        updated_at
      )
      VALUES (?, ?, NULL, 'free', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO NOTHING
    `, userId, userEmail);
  } catch (err) {
    console.error(`[quizall] Failed to ensure user ${userId}:`, err);
  }
}

// Check if column exists (PostgreSQL version)
export async function columnExists(table, column) {
  const result = await db.get(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = ? AND column_name = ?
  `, table, column);
  return !!result;
}

// Ensure column exists helper
export async function ensureColumn(table, column, definition) {
  const exists = await columnExists(table, column);
  if (!exists) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
