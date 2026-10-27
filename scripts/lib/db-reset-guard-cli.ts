#!/usr/bin/env tsx
/**
 * CLI wrapper for database reset guard.
 * Called from bash scripts to check if database reset is allowed.
 */

import { enforceDbResetGuard } from "./db-reset-guard";

enforceDbResetGuard();
