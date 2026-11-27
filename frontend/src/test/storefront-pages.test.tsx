import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProductReviews } from '../components/ProductReviews';
import { api } from '../services/api';

const auth = vi.hoisted(() => ({ isAuthenticated: true, user: { id: 7, name: 'Priya Sharma', role: 'USER' } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/api', () => ({
  api: { getReviews: vi.fn(), getReviewEligibility: vi.fn(), saveReview: vi.fn(), deleteReview: vi.fn() },
}));

const page = <T,>(content: T[]) => ({ content, page: 0, size: 5, totalElements: content.length, totalPages: 1, last: true });

beforeEach(() => {
  vi.resetAllMocks();
});

it('explains why a customer cannot review yet', async () => {
  vi.mocked(api.getReviews).mockResolvedValue(page([]));
  vi.mocked(api.getReviewEligibility).mockResolvedValue({ canReview: false, reason: 'You can review this product after it has been delivered to you.', myReview: null });
  render(<ProductReviews productId={5} />);
  expect(await screen.findByText(/after it has been delivered/)).toBeTruthy();
  expect(screen.queryByText('Write a review')).toBeNull();
});

it('lets a customer who received the product post a star rating', async () => {
  vi.mocked(api.getReviews).mockResolvedValue(page([]));
  vi.mocked(api.getReviewEligibility).mockResolvedValue({ canReview: true, reason: null, myReview: null });
  vi.mocked(api.saveReview).mockResolvedValue({
    id: 1, productId: 5, authorName: 'Priya S.', rating: 4, verifiedPurchase: true, mine: true, createdAt: '2026-11-17T10:00:00', updatedAt: '2026-11-17T10:00:00',
  });
  const changed = vi.fn();
  render(<ProductReviews productId={5} onChanged={changed} />);
  fireEvent.click(await screen.findByText('Write a review'));
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); // no rating chosen yet
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' }));
  fireEvent.change(screen.getByLabelText('Review text'), { target: { value: 'Solid kettle' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
  await waitFor(() => expect(api.saveReview).toHaveBeenCalledWith(5, { rating: 4, title: undefined, comment: 'Solid kettle' }));
  expect(changed).toHaveBeenCalled();
});
