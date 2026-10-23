/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CreatePostForm } from './test-component';

const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const originalFetch = globalThis.fetch;

function mockResponse(status: number, body: unknown): void {
  fetchMock.mockResolvedValue({
    status,
    json: async (): Promise<unknown> => body,
  } as Response);
}

function fillForm(title = 'First post', content = 'Hello world'): void {
  fireEvent.change(screen.getByTestId('post-title'), { target: { value: title } });
  fireEvent.change(screen.getByTestId('post-content'), { target: { value: content } });
}

describe('CreatePostForm', (): void => {
  beforeEach((): void => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterAll((): void => {
    globalThis.fetch = originalFetch;
  });

  it('has associated field labels and an accessible submit button', (): void => {
    render(<CreatePostForm />);

    expect(screen.getByLabelText('Title')).toBe(screen.getByTestId('post-title'));
    expect(screen.getByLabelText('Content')).toBe(screen.getByTestId('post-content'));
    expect(screen.getByTestId('post-submit')).toHaveAccessibleName('Create post');
  });

  it('posts trimmed values and clears the form only after success', async (): Promise<void> => {
    mockResponse(201, { id: 1, title: 'First post', content: 'Hello world' });
    render(<CreatePostForm />);
    fillForm(' First post ', ' Hello world ');

    fireEvent.click(screen.getByTestId('post-submit'));

    await waitFor((): void => expect(screen.getByRole('status')).toHaveTextContent('Post created.'));
    expect(fetchMock).toHaveBeenCalledWith('/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'First post', content: 'Hello world' }),
    });
    expect(screen.getByTestId('post-title')).toHaveValue('');
    expect(screen.getByTestId('post-content')).toHaveValue('');
    expect(screen.getByTestId('post-submit')).toBeEnabled();
  });

  it.each([
    ['', ''],
    ['  ', '\t\n'],
    ['Title', ''],
    ['', 'Content'],
  ])('validates missing or blank fields (%j, %j)', (title: string, content: string): void => {
    render(<CreatePostForm />);
    fillForm(title, content);

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    if (!title.trim()) {
      expect(screen.getByTestId('post-title')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('post-title')).toHaveAccessibleDescription('Enter a title.');
    }
    if (!content.trim()) {
      expect(screen.getByTestId('post-content')).toHaveAccessibleDescription('Enter content.');
    }
  });

  it('disables inputs and prevents duplicate submissions while saving', async (): Promise<void> => {
    let resolveRequest: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve): void => {
      resolveRequest = resolve;
    }));
    render(<CreatePostForm />);
    fillForm();

    fireEvent.click(screen.getByTestId('post-submit'));
    fireEvent.submit(screen.getByTestId('post-form'));

    expect(screen.getByTestId('post-submit')).toBeDisabled();
    expect(screen.getByTestId('post-submit')).toHaveTextContent('Creating');
    expect(screen.getByTestId('post-title')).toBeDisabled();
    expect(screen.getByTestId('post-content')).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async (): Promise<void> => {
      if (resolveRequest === undefined) {
        throw new Error('Expected a pending request.');
      }
      resolveRequest({ status: 201 } as Response);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Post created.');
  });

  it('shows API errors without losing the draft and allows retry', async (): Promise<void> => {
    mockResponse(429, { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' } });
    render(<CreatePostForm />);
    fillForm();

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');
    expect(screen.getByTestId('post-title')).toHaveValue('First post');
    expect(screen.getByTestId('post-content')).toHaveValue('Hello world');
    expect(screen.getByTestId('post-submit')).toBeEnabled();

    mockResponse(201, {});
    fireEvent.click(screen.getByTestId('post-submit'));

    await waitFor((): void => expect(screen.getByRole('status')).toHaveTextContent('Post created.'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    null,
    {},
    { error: null },
    { error: {} },
    { error: { message: 123 } },
    { error: { message: ' ' } },
  ])('shows a safe error for unexpected API errors: %j', async (body: unknown): Promise<void> => {
    mockResponse(500, body);
    render(<CreatePostForm />);
    fillForm();

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to create post. Please try again.');
    expect(screen.getByTestId('post-content')).toHaveValue('Hello world');
  });

  it('shows a network failure and preserves input', async (): Promise<void> => {
    fetchMock.mockRejectedValue(new TypeError('Network unavailable'));
    render(<CreatePostForm />);
    fillForm();

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to create post. Please try again.');
    expect(screen.getByTestId('post-title')).toHaveValue('First post');
    expect(screen.getByTestId('post-submit')).toBeEnabled();
  });

  it('shows a safe error when an error response is not JSON', async (): Promise<void> => {
    fetchMock.mockResolvedValue({
      status: 502,
      json: async (): Promise<unknown> => { throw new SyntaxError('Invalid JSON'); },
    } as Response);
    render(<CreatePostForm />);
    fillForm();

    fireEvent.click(screen.getByTestId('post-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to create post. Please try again.');
  });
});
