import { trace, context, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';

let tracer: Tracer | null = null;

export function getTracer(name = 'mariaboss'): Tracer {
  if (!tracer) {
    tracer = trace.getTracer(name, '0.1.0');
  }
  return tracer;
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const span = getTracer().startSpan(name, attributes ? { attributes } : undefined);
  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
