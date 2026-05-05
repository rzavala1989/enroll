import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="home">
      <h1>Enroll</h1>
      <p class="tagline">Browse this term's course catalog.</p>
      <a mat-flat-button color="primary" routerLink="/catalog">
        Browse Courses
      </a>
    </section>
  `,
  styles: [
    `
      .home {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        min-height: 60vh;
      }
      h1 {
        font-weight: 400;
        font-size: 2.25rem;
        margin: 0;
      }
      .tagline {
        margin: 0;
        opacity: 0.75;
      }
    `,
  ],
})
export class HomeComponent {}
