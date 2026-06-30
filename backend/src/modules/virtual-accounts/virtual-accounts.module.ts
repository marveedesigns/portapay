import { Module } from '@nestjs/common';
import { NombaModule } from '../../providers/nomba/nomba.module';
import { VirtualAccountsController } from './virtual-accounts.controller';
import { VirtualAccountsService } from './virtual-accounts.service';

@Module({
  imports: [NombaModule],
  controllers: [VirtualAccountsController],
  providers: [VirtualAccountsService],
  exports: [VirtualAccountsService],
})
export class VirtualAccountsModule {}