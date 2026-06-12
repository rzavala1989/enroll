import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';

// Pre-v14, every component lived inside a module, you had to declare it, export it, import the module
// elsewhere — it was 80% paperwork for any new component. Standalone components dropped that. Now you write a
// component, mark it standalone: true, and import dependencies directly into the component's imports array.
// NgModules still exist for legacy compat but are no longer the default and are being deprecated.

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatToolbarModule, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar color="primary">
      <span>Enroll</span>
    </mat-toolbar>
    <main class="app-content">
      <router-outlet />
    </main>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      .app-content {
        flex: 1;
        padding: 24px;
      }
    `,
  ],
})
export class AppComponent {}
