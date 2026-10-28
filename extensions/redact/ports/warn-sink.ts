/**
 * Outbound port: warning sink.
 *
 * The domain reports "your redact config is broken / was not loaded" without
 * deciding where the message goes (console, Pi notifications, a test array).
 */

export interface WarnSink {
  warn(message: string): void;
}
