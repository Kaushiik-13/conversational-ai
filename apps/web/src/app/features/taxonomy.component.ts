import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { ApiResponse, CategoryNode } from '../core/models';
import { apiErrorMessage } from '../core/models';

@Component({
  selector: 'app-taxonomy',
  imports: [ReactiveFormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">Global administration</p>
        <h1>Automotive taxonomy</h1>
        <p>Maintain the hierarchy that drives organization access and catalog classification.</p>
      </div>
      <button class="button button--primary" type="button" (click)="showCreate.set(!showCreate())">
        {{ showCreate() ? 'Close form' : 'Add category' }}
      </button>
    </header>

    @if (showCreate()) {
      <form class="panel create-form" [formGroup]="createForm" (ngSubmit)="create()">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">New branch</p>
            <h2>Add a category</h2>
          </div>
          <p>Choose an existing parent. The backend validates the hierarchy.</p>
        </div>
        <div class="form-grid form-grid--three">
          <label
            >Parent category
            <select formControlName="parentId">
              <option value="">Choose a parent</option>
              @for (category of flat(); track category.id) {
                <option [value]="category.id">
                  {{ indent(category.depth) }}{{ category.name }}
                </option>
              }
            </select>
          </label>
          <label>Name<input formControlName="name" placeholder="Category name" /></label>
          <label>Slug<input formControlName="slug" placeholder="lowercase-with-dashes" /></label>
        </div>
        <label class="checkbox"
          ><input type="checkbox" formControlName="isSecurityDomain" /> This is a top-level security
          domain</label
        >
        <div class="form-actions">
          <button class="button button--primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Adding…' : 'Add category' }}
          </button>
        </div>
      </form>
    }

    @if (message()) {
      <div class="notice notice--success" role="status">{{ message() }}</div>
    }
    @if (error()) {
      <div class="notice notice--error" role="alert">
        <strong>Taxonomy could not be updated</strong><span>{{ error() }}</span>
      </div>
    }

    <section class="panel taxonomy-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Category tree</p>
          <h2>{{ flat().length }} visible categories</h2>
        </div>
        <span>Select a row to edit</span>
      </div>
      @if (loading()) {
        <div class="table-loading">Loading taxonomy…</div>
      } @else {
        <div class="taxonomy-list">
          @for (category of flat(); track category.id) {
            <button
              type="button"
              [class.active]="selected()?.id === category.id"
              (click)="select(category)"
            >
              <span class="tree-lines">{{ indent(category.depth) }}</span>
              <span
                class="category-mark"
                [class.category-mark--domain]="category.isSecurityDomain"
                >{{ category.isSecurityDomain ? 'D' : 'C' }}</span
              >
              <div>
                <strong>{{ category.name }}</strong
                ><small>{{ category.slug }} · ID {{ category.id }}</small>
              </div>
              <span class="version">v{{ category.version }}</span>
            </button>
          }
        </div>
      }
    </section>

    @if (selected(); as category) {
      <section class="panel edit-drawer">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Selected category</p>
            <h2>{{ category.name }}</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            (click)="selected.set(null)"
            aria-label="Close editor"
          >
            ×
          </button>
        </div>
        <form [formGroup]="editForm" (ngSubmit)="rename()">
          <label>Display name<input formControlName="name" /></label>
          <div class="form-actions">
            <button class="button button--primary" type="submit" [disabled]="saving()">
              Save name
            </button>
            <button
              class="button button--danger"
              type="button"
              [disabled]="saving()"
              (click)="archive()"
            >
              Archive unused category
            </button>
          </div>
        </form>
        <p class="form-footnote">
          Categories with active children or catalog records cannot be archived.
        </p>
      </section>
    }
  `,
})
export class TaxonomyComponent {
  private readonly http = inject(HttpClient);
  readonly flat = signal<CategoryNode[]>([]);
  readonly selected = signal<CategoryNode | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly showCreate = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  readonly createForm = new FormGroup({
    parentId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    }),
    isSecurityDomain: new FormControl(false, { nonNullable: true }),
  });
  readonly editForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor() {
    void this.load();
  }

  select(category: CategoryNode): void {
    this.selected.set(category);
    this.editForm.setValue({ name: category.name });
  }

  indent(depth: number): string {
    return depth ? '— '.repeat(depth) : '';
  }

  async create(): Promise<void> {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.createForm.getRawValue();
      await firstValueFrom(
        this.http.post('/api/v1/categories', { ...value, parentId: Number(value.parentId) }),
      );
      this.message.set('The category was added.');
      this.createForm.reset({ parentId: '', name: '', slug: '', isSecurityDomain: false });
      this.showCreate.set(false);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async rename(): Promise<void> {
    const category = this.selected();
    if (!category || this.editForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.patch(`/api/v1/categories/${category.id}`, this.editForm.getRawValue(), {
          headers: { 'If-Match': `"${category.version}"` },
        }),
      );
      this.message.set('The category name was updated.');
      this.selected.set(null);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async archive(): Promise<void> {
    const category = this.selected();
    if (!category || this.saving()) return;
    if (!window.confirm(`Archive ${category.name}? Only unused leaf categories can be archived.`))
      return;
    this.saving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.delete(`/api/v1/categories/${category.id}`, {
          headers: { 'If-Match': `"${category.version}"` },
        }),
      );
      this.message.set('The unused category was archived.');
      this.selected.set(null);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<CategoryNode[]>>('/api/v1/categories/tree'),
      );
      const result: CategoryNode[] = [];
      const visit = (nodes: CategoryNode[]): void => {
        for (const node of nodes) {
          result.push({ ...node, name: node.name, children: undefined, path: node.path });
          visit(node.children ?? []);
        }
      };
      visit(response.data);
      this.flat.set(result);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
