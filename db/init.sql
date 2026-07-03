-- ============================================
-- 调查问卷系统数据库 Schema
-- PostgreSQL
-- ============================================

-- 问卷版本表
CREATE TABLE IF NOT EXISTS surveys (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 问卷部分/章节表
CREATE TABLE IF NOT EXISTS parts (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(survey_id, sort_order)
);

-- 题目表
CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  part_id INTEGER NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
  question_key VARCHAR(50) NOT NULL,
  type VARCHAR(20) NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  hint TEXT,
  placeholder TEXT,
  required BOOLEAN DEFAULT true,
  max_select INTEGER,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(survey_id, question_key)
);

-- 题目选项表
CREATE TABLE IF NOT EXISTS question_options (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_exclusive BOOLEAN DEFAULT false,
  UNIQUE(question_id, sort_order)
);

-- 受访者表
CREATE TABLE IF NOT EXISTS respondents (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id),
  submitter_id VARCHAR(100),
  user_name VARCHAR(50),
  is_test BOOLEAN DEFAULT false,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 答题记录表
CREATE TABLE IF NOT EXISTS responses (
  id SERIAL PRIMARY KEY,
  respondent_id INTEGER NOT NULL REFERENCES respondents(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  text_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(respondent_id, question_id)
);

-- 多选答案关联表
CREATE TABLE IF NOT EXISTS response_selected_options (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  question_option_id INTEGER NOT NULL REFERENCES question_options(id),
  UNIQUE(response_id, question_option_id)
);

-- ============================================
-- 索引
-- ============================================

CREATE INDEX IF NOT EXISTS idx_questions_survey_sort ON questions(survey_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_respondents_survey ON respondents(survey_id);
CREATE INDEX IF NOT EXISTS idx_respondents_test ON respondents(is_test);
CREATE INDEX IF NOT EXISTS idx_responses_respondent ON responses(respondent_id);
CREATE INDEX IF NOT EXISTS idx_responses_question ON responses(question_id);
CREATE INDEX IF NOT EXISTS idx_rso_response ON response_selected_options(response_id);
CREATE INDEX IF NOT EXISTS idx_rso_option ON response_selected_options(question_option_id);
CREATE INDEX IF NOT EXISTS idx_respondents_created_at ON respondents(created_at);
