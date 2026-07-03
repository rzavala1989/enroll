import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TBody, TD, TH, THead, TR, Table } from './table';

describe('Table', () => {
  it('renders no caption by default', () => {
    render(
      <Table>
        <THead>
          <tr>
            <TH>Name</TH>
          </tr>
        </THead>
      </Table>,
    );
    expect(screen.queryByText('Name', { selector: 'caption' })).not.toBeInTheDocument();
  });

  it('renders a visually hidden caption when provided', () => {
    render(
      <Table caption="Course sections">
        <THead>
          <tr>
            <TH>Name</TH>
          </tr>
        </THead>
      </Table>,
    );
    expect(screen.getByText('Course sections').tagName).toBe('CAPTION');
  });
});

describe('TH', () => {
  it('defaults to scope="col"', () => {
    render(
      <table>
        <thead>
          <tr>
            <TH>Name</TH>
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('scope', 'col');
  });

  it('lets callers override scope', () => {
    render(
      <table>
        <tbody>
          <tr>
            <TH scope="row">Row heading</TH>
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByRole('rowheader', { name: 'Row heading' })).toHaveAttribute('scope', 'row');
  });
});

describe('TBody, TD, TR', () => {
  it('render plain rows and cells', () => {
    render(
      <table>
        <TBody>
          <TR>
            <TD>Cell</TD>
          </TR>
        </TBody>
      </table>,
    );
    expect(screen.getByRole('cell', { name: 'Cell' })).toBeInTheDocument();
  });
});
