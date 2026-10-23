import { useId, useState, type FormEvent, type ReactElement } from 'react';
import styles from './test-component.module.css';

class PostSubmissionError extends Error {}

/**
 * Renders an accessible form that creates a post through POST /posts.
 * @returns The blog post form with validation and submission feedback.
 * @throws If rendered outside a React rendering context.
 */
export function CreatePostForm(): ReactElement {
  const id = useId();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ title: '', content: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    setError('');
    setIsCreated(false);
    const input = { title: title.trim(), content: content.trim() };
    const errors = {
      title: input.title ? '' : 'Enter a title.',
      content: input.content ? '' : 'Enter content.',
    };
    setFieldErrors(errors);
    if (errors.title || errors.content) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (response.status !== 201) {
        const result: unknown = await response.json();
        if (
          typeof result === 'object' && result !== null && 'error' in result &&
          typeof result.error === 'object' && result.error !== null &&
          'message' in result.error && typeof result.error.message === 'string' &&
          result.error.message.trim().length > 0
        ) {
          throw new PostSubmissionError(result.error.message);
        }
        throw new PostSubmissionError('Unable to create post. Please try again.');
      }

      setTitle('');
      setContent('');
      setIsCreated(true);
    } catch (cause: unknown) {
      setError(
        cause instanceof PostSubmissionError
          ? cause.message
          : 'Unable to create post. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className={styles['post-form']}
      onSubmit={handleSubmit}
      noValidate
      aria-label="Create a blog post"
      aria-busy={isSubmitting}
      data-testid="post-form"
    >
      <h2>Create a blog post</h2>
      <div className={styles['post-form__field']}>
        <label htmlFor={`${id}-title`}>Title</label>
        <input
          id={`${id}-title`}
          name="title"
          type="text"
          aria-label="Title"
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? `${id}-title-error` : undefined}
          data-testid="post-title"
          value={title}
          onChange={(event): void => setTitle(event.target.value)}
          disabled={isSubmitting}
          required
        />
        {fieldErrors.title && (
          <p id={`${id}-title-error`} className={styles['post-form__error']} role="alert">
            {fieldErrors.title}
          </p>
        )}
      </div>
      <div className={styles['post-form__field']}>
        <label htmlFor={`${id}-content`}>Content</label>
        <textarea
          id={`${id}-content`}
          name="content"
          aria-label="Content"
          aria-invalid={Boolean(fieldErrors.content)}
          aria-describedby={fieldErrors.content ? `${id}-content-error` : undefined}
          data-testid="post-content"
          value={content}
          onChange={(event): void => setContent(event.target.value)}
          disabled={isSubmitting}
          rows={8}
          required
        />
        {fieldErrors.content && (
          <p id={`${id}-content-error`} className={styles['post-form__error']} role="alert">
            {fieldErrors.content}
          </p>
        )}
      </div>
      {error && <p className={styles['post-form__error']} role="alert">{error}</p>}
      <p role="status">{isCreated ? 'Post created.' : ''}</p>
      <button
        type="submit"
        aria-label="Create post"
        data-testid="post-submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Creating...' : 'Create post'}
      </button>
    </form>
  );
}