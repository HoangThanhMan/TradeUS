// src/utils/chartHelpers.ts

/**
 * Convert price value to Y pixel position on chart
 */
export function priceToYPosition(
  price: number,
  chartInstance: any,
  containerHeight: number
): number {
  if (!chartInstance) return 0;

  try {
    // Get visible range from chart
    const visibleRange = chartInstance.getVisibleRange();
    if (!visibleRange) return 0;

    // Get price range
    const priceRange = chartInstance.getPriceRange();
    if (!priceRange || !priceRange.min || !priceRange.max) return 0;

    const { min, max } = priceRange;
    const range = max - min;

    if (range === 0) return containerHeight / 2;

    // Calculate percentage from bottom (0 = min price, 1 = max price)
    const percentage = (price - min) / range;

    // Convert to Y position (inverted: top = high price)
    const yPosition = containerHeight * (1 - percentage);

    return yPosition;
  } catch (error) {
    console.error('Error calculating Y position:', error);
    return 0;
  }
}

/**
 * Get current visible price range from chart
 */
export function getVisiblePriceRange(chartInstance: any): {
  min: number;
  max: number;
} | null {
  if (!chartInstance) return null;

  try {
    const priceRange = chartInstance.getPriceRange();
    if (!priceRange) return null;

    return {
      min: priceRange.min || 0,
      max: priceRange.max || 0,
    };
  } catch (error) {
    console.error('Error getting price range:', error);
    return null;
  }
}