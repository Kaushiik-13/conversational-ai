import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LLM_PROVIDERS } from './llm.types';
import { OllamaProvider } from './ollama.provider';

@Module({
  providers: [
    OllamaProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (ollama: OllamaProvider) => [ollama],
      inject: [OllamaProvider],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
