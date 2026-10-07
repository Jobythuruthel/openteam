import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument } from './openapi';

@Controller()
export class OpenApiController {
  private readonly document = buildOpenApiDocument();

  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  openapi() {
    return this.document;
  }
}
