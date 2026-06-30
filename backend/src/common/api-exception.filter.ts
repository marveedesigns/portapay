import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

interface ErrorBody {
  message?: string | string[];
  code?: string;
  error?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const errorBody = typeof body === 'object' && body !== null ? (body as ErrorBody) : undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody?.message.join('; ')
      : errorBody?.message ?? (typeof body === 'string' ? body : 'Unexpected server error');

    response.status(status).send({
      success: false,
      error: {
        code: errorBody?.code ?? errorBody?.error ?? HttpStatus[status] ?? 'ERROR',
        message,
      },
    });
  }
}
