-- Telegram notification system schema

-- Keywords for notification triggers
CREATE TABLE IF NOT EXISTS notification_keywords (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(255) NOT NULL,
  match_type VARCHAR(50) DEFAULT 'exact', -- exact, fuzzy, regex, contains
  priority VARCHAR(20) DEFAULT 'normal', -- critical, high, normal, low
  telegram_channel_id VARCHAR(255),
  telegram_channel_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  min_confidence DECIMAL(3,2) DEFAULT 0.70, -- Minimum transcript confidence to trigger
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster keyword matching
CREATE INDEX idx_keywords_active ON notification_keywords(keyword, is_active) WHERE is_active = true;

-- Notification history and tracking
CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  call_id INTEGER REFERENCES calls(id),
  keyword_id INTEGER REFERENCES notification_keywords(id),
  keyword_matched VARCHAR(255),
  telegram_message_id VARCHAR(255),
  telegram_channel_id VARCHAR(255),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50), -- queued, sending, sent, failed, retry
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  audio_mp3_path TEXT,
  message_text TEXT,
  metadata JSONB -- Store additional data like hospital info, related calls
);

-- Index for finding related notifications
CREATE INDEX idx_notification_history_call ON notification_history(call_id);
CREATE INDEX idx_notification_history_status ON notification_history(status, sent_at);

-- Aggregation table for linking hospital calls to dispatch incidents
CREATE TABLE IF NOT EXISTS notification_aggregations (
  id SERIAL PRIMARY KEY,
  incident_id VARCHAR(255),
  dispatch_call_id INTEGER REFERENCES calls(id),
  hospital_call_ids INTEGER[],
  telegram_message_ids VARCHAR(255)[],
  aggregated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notification_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for incident lookups
CREATE INDEX idx_aggregations_incident ON notification_aggregations(incident_id);
CREATE INDEX idx_aggregations_dispatch ON notification_aggregations(dispatch_call_id);

-- Telegram channel configuration
CREATE TABLE IF NOT EXISTS telegram_channels (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR(255) UNIQUE NOT NULL,
  channel_name VARCHAR(255),
  channel_type VARCHAR(50), -- group, channel, private
  is_active BOOLEAN DEFAULT true,
  webhook_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP
);

-- Notification queue for reliable delivery
CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,
  notification_type VARCHAR(50), -- dispatch, hospital, aggregated
  priority INTEGER DEFAULT 5,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Index for queue processing
CREATE INDEX idx_queue_status_priority ON notification_queue(status, priority, created_at) 
WHERE status IN ('pending', 'retry');