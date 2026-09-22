-- ============================================================================
-- Schéma complet de la base de données PrononciA+
-- ============================================================================
-- Ce fichier est une COPIE DE SECOURS versionnée du schéma que db.js
-- (fonction initSchema) crée déjà automatiquement au démarrage du serveur.
-- En temps normal tu n'as PAS besoin de lancer ce fichier : `node server.js`
-- suffit à créer les tables dans une base vide. Ce script sert de filet de
-- sécurité si jamais initSchema() est modifié/cassé, ou pour recréer la
-- structure sans démarrer tout le backend (ex. inspection rapide).
--
-- ÉTAPE 1 — Créer la base vide (une seule fois, avec un utilisateur ayant
-- les droits CREATE DATABASE) :
--   CREATE DATABASE prononciation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   (remplace "prononciation" par la valeur de DB_NAME dans backend/.env)
--
-- ÉTAPE 2 — Importer ce schéma :
--   mysql -u root -p prononciation < schema.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  email                     VARCHAR(255) NOT NULL UNIQUE,
  password_hash             VARCHAR(255) NOT NULL,
  display_name              VARCHAR(255),
  role                      VARCHAR(20) NOT NULL DEFAULT 'user',
  avatar_url                VARCHAR(500),
  email_verified            TINYINT(1) NOT NULL DEFAULT 1,
  email_verify_token_hash   VARCHAR(64),
  email_verify_expires      DATETIME,
  is_premium                TINYINT(1) NOT NULL DEFAULT 0,
  premium_since             DATETIME,
  phone_number              VARCHAR(20),
  password_reset_code_hash  VARCHAR(64),
  password_reset_expires    DATETIME,
  created_at                DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP())
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS premium_transactions (
  id                      INT AUTO_INCREMENT PRIMARY KEY,
  user_id                 INT NOT NULL,
  fedapay_transaction_id  VARCHAR(64) NOT NULL,
  amount                  INT NOT NULL,
  currency                VARCHAR(10) NOT NULL DEFAULT 'XOF',
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at              DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  updated_at              DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()) ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fedapay_tx (fedapay_transaction_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_installs (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NULL,
  platform    VARCHAR(20),
  user_agent  VARCHAR(500),
  created_at  DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tentatives (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  user_id             INT NOT NULL,
  expected_word       VARCHAR(255) NOT NULL,
  recognized_text     VARCHAR(255),
  jaccard             FLOAT,
  cosine              FLOAT,
  per                 FLOAT,
  verdict             VARCHAR(255),
  alignment_json      JSON NULL,
  is_daily_challenge  TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  INDEX idx_tentatives_user (user_id, created_at),
  INDEX idx_tentatives_daily (is_daily_challenge, created_at),
  CONSTRAINT fk_tentatives_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS matches (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  room_code    VARCHAR(12) NOT NULL,
  word         VARCHAR(255) NOT NULL,
  created_by   INT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP()),
  finished_at  DATETIME NULL,
  CONSTRAINT fk_matches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS match_participants (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  match_id         INT NOT NULL,
  user_id          INT NOT NULL,
  turn_order       INT NOT NULL,
  per              FLOAT,
  recognized_text  VARCHAR(255),
  verdict          VARCHAR(255),
  placement        INT NULL COMMENT '1 = or, 2 = argent, 3 = bronze, NULL = pas classé',
  INDEX idx_match_participants_user (user_id),
  CONSTRAINT fk_match_participants_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;