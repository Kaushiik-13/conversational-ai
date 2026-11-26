import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { LlmService } from './llm.service';
import { LLM_PROVIDERS, type LlmProvider } from './llm.types';
import { OllamaProvider } from './ollama.provider';

@Module({
  providers: [
    OllamaProvider,
    GeminiProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (
        ollama: OllamaProvider,
        gemini: GeminiProvider,
      ): LlmProvider[] => [ollama, gemini],
      inject: [OllamaProvider, GeminiProvider],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
