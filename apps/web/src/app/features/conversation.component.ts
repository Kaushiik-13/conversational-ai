import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse } from '../core/models';
import { apiErrorMessage } from '../core/models';

interface CubeQuerySummary {
  version: number;
  model: string;
  mode?: 'aggregate' | 'records';
  measures: string[];
  dimensions: string[];
  fields?: string[];
  filters: Array<{ field: string; operator: string; value: unknown }>;
  order_by?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  limit: number;
}

interface ConversationAnswer {
  status: 'answered' | 'clarification' | 'unsupported';
  message: string;
  query?: CubeQuerySummary;
  rows?: Array<Record<string, unknown>>;
}

interface ConversationTurn {
  id: number;
  question: string;
  loading: boolean;
  answer?: ConversationAnswer;
  requestId?: string;
  error?: string;
  durationMs?: number;
}

const STARTER_QUESTIONS = [
  'How many parts do we have in each commodity?',
  'How many parts are there in total?',
  'How many parts are there by manufacturer?',
  'How many parts are there in each region?',
];

@Component({
  selector: 'app-conversation',
  imports: [ReactiveFormsModule],
  template: `
    <div class="conversation-page">
      <header class="page-header conversation-header">
        <div>
          <p class="eyebrow">Automotive assistant</p>
          <h1>Ask your catalog</h1>
          <p>Ask about parts, manufacturers, commodities, programs, or regions.</p>
        </div>
        @if (turns().length > 0) {
          <button class="button button--outline" type="button" (click)="startNewConversation()">
            New conversation
          </button>
        }
      </header>

      <section class="conversation-workspace" aria-label="Automotive catalog conversation">
        @if (turns().length === 0) {
          <div class="conversation-welcome">
            <span class="conversation-spark" aria-hidden="true">✦</span>
            <p class="eyebrow">Your organization’s catalog</p>
            <h2>What would you like to know?</h2>
            <p>
              Answers use the data and permissions for your active organization. Ask a follow-up
              question to refine or compare a previous result.
            </p>
            <div class="conversation-starters" aria-label="Example questions">
              @for (question of starterQuestions; track question) {
                <button type="button" (click)="ask(question)">{{ question }}</button>
              }
            </div>
          </div>
        } @else {
          <div class="conversation-history" aria-live="polite" aria-relevant="additions">
            @for (turn of turns(); track turn.id) {
              <article class="conversation-turn">
                <div class="conversation-question">
                  <span class="conversation-avatar conversation-avatar--user" aria-hidden="true"
                    >You</span
                  >
                  <p>{{ turn.question }}</p>
                </div>

                @if (turn.loading) {
                  <div class="conversation-pending" role="status">
                    <span
                      class="conversation-avatar conversation-avatar--assistant"
                      aria-hidden="true"
                      >✦</span
                    >
                    <span class="conversation-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                    <span>Checking your authorized catalog…</span>
                  </div>
                }

                @if (turn.error) {
                  <div class="notice notice--error conversation-error" role="alert">
                    <strong>We couldn’t answer that</strong>
                    <span>{{ turn.error }}</span>
                    @if (turn.durationMs !== undefined) {
                      <small>Failed after {{ formatDuration(turn.durationMs) }}</small>
                    }
                    <button class="text-button" type="button" (click)="ask(turn.question)">
                      Try again
                    </button>
                  </div>
                }

                @if (turn.answer; as answer) {
                  <div class="conversation-answer">
                    <div class="conversation-answer-heading">
                      <span
                        class="conversation-avatar conversation-avatar--assistant"
                        aria-hidden="true"
                        >✦</span
                      >
                      <span
                        class="conversation-status"
                        [class.conversation-status--notice]="answer.status !== 'answered'"
                      >
                        {{ statusLabel(answer.status) }}
                      </span>
                    </div>
                    <p class="conversation-answer-message">{{ answer.message }}</p>
                    @if (turn.durationMs !== undefined) {
                      <p class="conversation-duration">
                        Answered in {{ formatDuration(turn.durationMs) }}
                      </p>
                    }

                    @if (answer.rows?.length) {
                      <div class="conversation-table-wrap">
                        <table class="conversation-table">
                          <thead>
                            <tr>
                              @for (column of columns(answer); track column) {
                                <th scope="col">{{ fieldLabel(column) }}</th>
                              }
                            </tr>
                          </thead>
                          <tbody>
                            @for (row of answer.rows; track $index) {
                              <tr>
                                @for (column of columns(answer); track column) {
                                  <td>{{ formatCell(row[column]) }}</td>
                                }
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                      <p class="conversation-row-count">
                        {{ answer.rows?.length }} result rows · scoped to your active organization
                      </p>
                    } @else if (answer.status === 'answered') {
                      <p class="conversation-empty-result">
                        No visible rows matched that question.
                      </p>
                    }

                    @if (answer.query) {
                      <details class="conversation-trace">
                        <summary>How the question was interpreted</summary>
                        <div class="conversation-trace-content">
                          @if (answer.query.mode === 'records') {
                            <p>
                              <strong>Part details</strong
                              >{{ answer.query.fields?.map(fieldLabel)?.join(', ') }}
                            </p>
                          } @else {
                            <p>
                              <strong>Measure</strong
                              >{{ answer.query.measures.map(fieldLabel).join(', ') }}
                            </p>
                            <p>
                              <strong>Grouped by</strong
                              >{{
                                answer.query.dimensions.length
                                  ? answer.query.dimensions.map(fieldLabel).join(', ')
                                  : 'Total'
                              }}
                            </p>
                          }
                          @if (answer.query.filters.length > 0) {
                            <p><strong>Filters</strong>{{ filterSummary(answer.query.filters) }}</p>
                          }
                          @if (answer.query.order_by?.length) {
                            <p>
                              <strong>Sorted by</strong>{{ sortSummary(answer.query.order_by!) }}
                            </p>
                          }
                          <p><strong>Result limit</strong>{{ answer.query.limit }}</p>
                          @if (turn.requestId) {
                            <small>Request {{ turn.requestId }}</small>
                          }
                        </div>
                      </details>
                    }
                  </div>
                }
              </article>
            }
          </div>
        }

        <form class="conversation-composer" (ngSubmit)="submit()">
          <label class="visually-hidden" for="conversation-question"
            >Ask an automotive catalog question</label
          >
          <textarea
            id="conversation-question"
            [formControl]="questionControl"
            rows="2"
            maxlength="1000"
            placeholder="Ask a complete question about your catalog…"
            (keydown)="onComposerKeydown($event)"
          ></textarea>
          <div class="conversation-composer-footer">
            <span>Answers are limited to data you’re allowed to see.</span>
            <div>
              <span>{{ questionControl.value.length }}/1000</span>
              <button
                class="button button--accent"
                type="submit"
                [disabled]="busy() || questionControl.value.trim().length < 3"
              >
                {{ busy() ? 'Working…' : 'Ask' }}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  `,
})
export class ConversationComponent {
  private readonly http = inject(HttpClient);

  readonly starterQuestions = STARTER_QUESTIONS;
  readonly questionControl = new FormControl('', { nonNullable: true });
  readonly turns = signal<ConversationTurn[]>([]);
  readonly busy = signal(false);
  private nextTurnId = 1;

  submit(): void {
    void this.ask(this.questionControl.value);
  }

  async ask(question: string): Promise<void> {
    const cleanQuestion = question.trim();
    if (cleanQuestion.length < 3 || cleanQuestion.length > 1000 || this.busy()) return;

    const id = this.nextTurnId++;
    const startedAt = performance.now();
    this.turns.update((turns) => [...turns, { id, question: cleanQuestion, loading: true }]);
    this.questionControl.setValue('');
    this.busy.set(true);

    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<ConversationAnswer>>('/api/v1/conversation/ask', {
          question: cleanQuestion,
          ...(this.historyForNextQuestion().length
            ? { history: this.historyForNextQuestion() }
            : {}),
        }),
      );
      this.updateTurn(id, {
        loading: false,
        answer: response.data,
        requestId: response.meta.requestId,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      this.updateTurn(id, {
        loading: false,
        error: apiErrorMessage(
          error,
          'The assistant is temporarily unavailable. Check the configured model service and try again.',
        ),
        durationMs: performance.now() - startedAt,
      });
    } finally {
      this.busy.set(false);
    }
  }

  startNewConversation(): void {
    if (this.busy()) return;
    this.turns.set([]);
    this.questionControl.setValue('');
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    }
  }

  statusLabel(status: ConversationAnswer['status']): string {
    if (status === 'clarification') return 'Needs clarification';
    if (status === 'unsupported') return 'Outside this model';
    return 'Answer';
  }

  columns(answer: ConversationAnswer): string[] {
    return answer.rows?.length ? Object.keys(answer.rows[0]) : [];
  }

  fieldLabel(field: string): string {
    return field.replaceAll('_', ' ');
  }

  formatCell(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  formatDuration(durationMs: number): string {
    if (durationMs < 1000) return `${Math.max(1, Math.round(durationMs))} ms`;
    return `${(durationMs / 1000).toFixed(1)} sec`;
  }

  filterSummary(filters: CubeQuerySummary['filters']): string {
    return filters
      .map(
        (filter) =>
          `${this.fieldLabel(filter.field)} ${filter.operator} ${this.formatCell(filter.value)}`,
      )
      .join(', ');
  }

  sortSummary(orderBy: NonNullable<CubeQuerySummary['order_by']>): string {
    return orderBy
      .map(({ field, direction }) => `${this.fieldLabel(field)} ${direction}`)
      .join(', ');
  }

  private historyForNextQuestion(): Array<{
    question: string;
    query?: CubeQuerySummary;
    assistantMessage?: string;
  }> {
    return this.turns()
      .filter((turn) => Boolean(turn.answer?.query || turn.answer?.message))
      .slice(-4)
      .map((turn) => ({
        question: turn.question,
        ...(turn.answer?.query ? { query: turn.answer.query } : {}),
        ...(turn.answer?.status === 'clarification' && turn.answer.message
          ? { assistantMessage: turn.answer.message }
          : {}),
      }));
  }

  private updateTurn(id: number, update: Partial<ConversationTurn>): void {
    this.turns.update((turns) =>
      turns.map((turn) => (turn.id === id ? { ...turn, ...update } : turn)),
    );
  }
}
