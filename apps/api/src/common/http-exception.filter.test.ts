import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

function host(requestId = 'req-1') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const argumentsHost = {
    switchToHttp: () => ({
      getRequest: () => ({ id: requestId }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { argumentsHost, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('maps client errors to a code and keeps the message', () => {
    const { argumentsHost, status, json } = host();
    filter.catch(new BadRequestException('Invalid cursor'), argumentsHost);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'bad_request', message: 'Invalid cursor', requestId: 'req-1' },
    });
  });

  it('maps not found', () => {
    const { argumentsHost, json } = host();
    filter.catch(new NotFoundException(), argumentsHost);
    expect(json.mock.calls[0]?.[0]).toMatchObject({ error: { code: 'not_found' } });
  });

  it('hides internal error details', () => {
    const { argumentsHost, status, json } = host();
    filter.catch(new Error('password=hunter2 in stack'), argumentsHost);
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0]?.[0];
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });
});
