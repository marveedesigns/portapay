import { Module } from '@nestjs/common';
import { NombaProvider } from './nomba.provider';

@Module({
  providers: [NombaProvider],
  exports: [NombaProvider],
})
export class NombaModule {}