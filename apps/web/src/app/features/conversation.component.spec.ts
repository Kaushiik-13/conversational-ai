import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConversationComponent } from './conversation.component';

describe('ConversationComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConversationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the protected API and renders the answer rows and query trace', async () => {
    const fixture = TestBed.createComponent(ConversationComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const requestPromise = component.ask('How many parts by commodity?');
    const request = http.expectOne('/api/v1/conversation/ask');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      question: 'How many parts by commodity?',
    });
    request.flush({
      data: {
        status: 'answered',
        message: 'Here are the matching catalog results.',
        query: {
          version: 1,
          model: 'automotive_catalog',
          measures: ['part_count'],
          dimensions: ['commodity'],
          filters: [],
          order_by: [{ field: 'part_count', direction: 'desc' }],
          limit: 100,
        },
        rows: [{ part_count: '5', commodity: 'Braking' }],
      },
      meta: { requestId: 'request-1', rowCount: 1 },
    });
    await requestPromise;
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Here are the matching catalog results.');
    expect(page.textContent).toContain('Braking');
    expect(page.textContent).toContain('part count');
    expect(page.textContent).toContain('request-1');
    expect(page.textContent).toMatch(/Sorted by\s*part count desc/);
    expect(page.textContent).toMatch(/Answered in \d+ ms|Answered in \d+\.\d sec/);
  });

  it('shows elapsed time when a request fails', async () => {
    const fixture = TestBed.createComponent(ConversationComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const requestPromise = component.ask('Compare parts by commodity');
    http
      .expectOne('/api/v1/conversation/ask')
      .flush(
        { error: { code: 'LOCAL_MODEL_TIMEOUT', message: 'The model timed out.' } },
        { status: 504, statusText: 'Gateway Timeout' },
      );
    await requestPromise;
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Failed after');
  });

  it('sends prior interpreted queries to support follow-up questions', async () => {
    const fixture = TestBed.createComponent(ConversationComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const first = component.ask('Count parts by manufacturer in Europe');
    http.expectOne('/api/v1/conversation/ask').flush({
      data: {
        status: 'answered',
        message: 'Results.',
        query: {
          version: 1,
          model: 'automotive_catalog',
          measures: ['part_count'],
          dimensions: ['manufacturer'],
          filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
          limit: 100,
        },
        rows: [],
      },
      meta: { requestId: 'request-2', rowCount: 0 },
    });
    await first;

    const followUp = component.ask('Show just the top five');
    const request = http.expectOne('/api/v1/conversation/ask');
    expect(request.request.body).toEqual({
      question: 'Show just the top five',
      history: [
        {
          question: 'Count parts by manufacturer in Europe',
          query: {
            version: 1,
            model: 'automotive_catalog',
            measures: ['part_count'],
            dimensions: ['manufacturer'],
            filters: [{ field: 'region', operator: 'equals', value: 'Europe' }],
            limit: 100,
          },
        },
      ],
    });
    request.flush({
      data: { status: 'unsupported', message: 'Outside this model.' },
      meta: { requestId: 'request-3', rowCount: 0 },
    });
    await followUp;
  });
});
