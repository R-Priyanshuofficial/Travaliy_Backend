import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 120_000, // 2 minutes default timeout
      maxRedirects: 3,
    }),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
