import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent, pathMatch: 'full' },
  {
    path: 'catalog',
    loadComponent: () =>
      import('./catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  { path: '**', redirectTo: '' },
];
