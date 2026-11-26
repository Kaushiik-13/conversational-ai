import { Module } from '@nestjs/common';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { LlmService } from './llm.service';
import { LLM_PROVIDERS, type LlmProvider } from './llm.types';
import { OllamaProvider } from './ollama.provider';

@Module({
  providers: [
    OllamaProvider,
    GeminiProvider,
    GroqProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (
        ollama: OllamaProvider,
        gemini: GeminiProvider,
        groq: GroqProvider,
      ): LlmProvider[] => [ollama, gemini, groq],
      inject: [OllamaProvider, GeminiProvider, GroqProvider],
    },
    LlmService,
  ],
  exports: [LlmService],
})
export class LlmModule {}
