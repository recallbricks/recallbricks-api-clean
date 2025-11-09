/**
 * Structured Logging Utility
 *
 * Production-grade logging with request IDs, log levels, and JSON formatting
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  stack?: string;
  [key: string]: any;
}

class Logger {
  private minLevel: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    this.minLevel = this.parseLogLevel(envLevel) ||
      (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG);
  }

  private parseLogLevel(level?: string): LogLevel | null {
    switch (level) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      default: return null;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private formatLog(entry: LogEntry): string {
    if (process.env.NODE_ENV === 'production') {
      // JSON format for production
      return JSON.stringify(entry);
    } else {
      // Human-readable format for development
      const { timestamp, level, message, requestId, ...rest } = entry;
      const prefix = `[${timestamp}] ${level.toUpperCase()}`;
      const reqId = requestId ? ` [${requestId}]` : '';
      const details = Object.keys(rest).length > 0 ? `\n${JSON.stringify(rest, null, 2)}` : '';
      return `${prefix}${reqId}: ${message}${details}`;
    }
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };

    const formatted = this.formatLog(entry);

    if (level === LogLevel.ERROR) {
      console.error(formatted);
    } else if (level === LogLevel.WARN) {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  // HTTP request logging
  logRequest(data: {
    requestId: string;
    method: string;
    path: string;
    userId?: string;
    statusCode?: number;
    duration?: number;
    error?: string;
  }): void {
    const { requestId, method, path, userId, statusCode, duration, error } = data;

    const level = error ? LogLevel.ERROR :
                  statusCode && statusCode >= 500 ? LogLevel.ERROR :
                  statusCode && statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;

    const message = `${method} ${path} ${statusCode || 'pending'}${duration ? ` ${duration}ms` : ''}`;

    this.log(level, message, {
      type: 'http_request',
      requestId,
      method,
      path,
      userId,
      statusCode,
      duration,
      error,
    });
  }
}

export const logger = new Logger();
