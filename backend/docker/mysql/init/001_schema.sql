-- ============================================================
-- ReachInbox Email Scheduler
-- Database Schema
-- MySQL 8
-- ============================================================

-- ------------------------------------------------------------
-- CAMPAIGNS
-- One row represents one email-scheduling campaign.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaigns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- User who created the campaign.
    -- Google OAuth will eventually provide this information.
    user_email VARCHAR(255) NOT NULL,

    -- Email content shared by all recipients.
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,

    -- When the campaign should begin sending.
    start_time DATETIME NOT NULL,

    -- Minimum delay between individual email sends.
    -- Example: 2 means at least 2 seconds between sends.
    delay_seconds INT UNSIGNED NOT NULL DEFAULT 2,

    -- Maximum number of emails allowed during one hour.
    hourly_limit INT UNSIGNED NOT NULL DEFAULT 200,

    -- Ethereal sender account used for this campaign.
    sender_email VARCHAR(255) NOT NULL,

    -- Number of recipients in this campaign.
    total_recipients INT UNSIGNED NOT NULL DEFAULT 0,

    -- Current lifecycle state of the campaign.
    status ENUM('active', 'paused', 'completed')
        NOT NULL DEFAULT 'active',

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id)

) ENGINE=InnoDB;


-- ------------------------------------------------------------
-- EMAILS
-- One row represents one recipient in a campaign.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS emails (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    -- Which campaign this email belongs to.
    campaign_id BIGINT UNSIGNED NOT NULL,

    -- Individual recipient.
    recipient_email VARCHAR(255) NOT NULL,

    -- Position in the original CSV/send order.
    -- 0 = first email, 1 = second email, etc.
    --
    -- This is important when rate limiting forces us to
    -- move emails into a later hour.
    slot_index INT UNSIGNED NOT NULL,

    -- PLANNED time at which this email should be sent.
    --
    -- This can change if rate limiting or other scheduling
    -- logic defers the email.
    scheduled_at DATETIME NOT NULL,

    -- ACTUAL time the email was successfully sent.
    --
    -- NULL means it has not been successfully sent yet.
    --
    -- scheduled_at and sent_at are intentionally separate.
    -- Retries and rate-limit deferrals can make these times
    -- different. That difference becomes an important
    -- debugging signal.
    sent_at DATETIME NULL,

    -- Current state of this email.
    status ENUM('scheduled', 'sending', 'sent', 'failed')
        NOT NULL DEFAULT 'scheduled',

    -- Has this email already been pushed to BullMQ?
    --
    -- This acts as the batch spawner's cursor.
    --
    -- The spawner does NOT enqueue all 1000 jobs at once.
    -- It periodically finds rows that are due soon AND
    -- job_enqueued = false.
    --
    -- If the spawner crashes halfway through, it can resume
    -- by finding the rows that are still false.
    job_enqueued BOOLEAN NOT NULL DEFAULT FALSE,

    -- Number of attempts made to send this email.
    attempts INT UNSIGNED NOT NULL DEFAULT 0,

    -- Error from the most recent failed attempt.
    error_message TEXT NULL,

    -- Ethereal preview URL after successful sending.
    preview_url TEXT NULL,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

   PRIMARY KEY (id),

    -- If a campaign is deleted, all its emails should
    -- automatically be deleted as well.
    CONSTRAINT fk_emails_campaign
        FOREIGN KEY (campaign_id)
        REFERENCES campaigns(id)
        ON DELETE CASCADE,

    -- Prevents the same recipient from being added twice
    -- to the same campaign.
    UNIQUE KEY uq_campaign_recipient
        (campaign_id, recipient_email),

    -- Helps the batch spawner find emails that need
    -- to be enqueued.
    INDEX idx_emails_scheduled_enqueued
        (scheduled_at, job_enqueued),

    -- Helps dashboard queries that filter emails by
    -- campaign and status.
    INDEX idx_emails_campaign_status
        (campaign_id, status)

) ENGINE=InnoDB;