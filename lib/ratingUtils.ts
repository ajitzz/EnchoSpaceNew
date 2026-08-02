export function getRatingWord(rating: number): string {
    if (rating >= 9.0) return 'Exceptional';
    if (rating >= 8.0) return 'Excellent';
    if (rating >= 7.0) return 'Very Good';
    if (rating >= 6.0) return 'Good';
    if (rating > 0) return 'Review score';
    return 'New';
}

export function formatRating(rating: number | undefined | null): string {
    if (!rating) return 'New';
    return Number(rating).toFixed(1);
}
