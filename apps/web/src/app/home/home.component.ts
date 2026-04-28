import { ChangeDetectionStrategy, Component } from '@angular/core';

 @Component({
  selector: 'app-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="home">
      <h1>Enroll, coming soon</h1>
    </section>
  `,
  styles: [
    `
      .home {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 60vh;
      }
      h1 {
        font-weight: 400;
        font-size: 2rem;
        opacity: 0.85;
      }
    `,
  ],
})
export class HomeComponent {}
