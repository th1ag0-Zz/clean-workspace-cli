export function summarizeScan(results) {
  const items = results.flatMap((result) => result.items);
  const byRisk = { safe: 0, review: 0, sensitive: 0 };
  for (const result of results) {
    byRisk[result.target.risk] = (byRisk[result.target.risk] ?? 0) + result.items.length;
  }

  return Object.freeze({
    scannedTargetCount: results.length,
    targetCount: results.filter((result) => result.items.length > 0).length,
    itemCount: items.length,
    reclaimableBytes: items.reduce((total, item) => total + item.size, 0),
    byRisk: Object.freeze(byRisk),
    recommendation: recommendationFor(byRisk, items.length),
  });
}

function recommendationFor(byRisk, itemCount) {
  if (itemCount === 0) {
    return Object.freeze({ code: 'nothing-to-clean', message: 'Nothing to clean.' });
  }
  if (byRisk.sensitive > 0) {
    return Object.freeze({
      code: 'review-sensitive-items',
      message: 'Review sensitive items individually before cleaning.',
    });
  }
  if (byRisk.review > 0) {
    return Object.freeze({
      code: 'review-before-cleaning',
      message: 'Review rebuild cost before cleaning.',
    });
  }
  return Object.freeze({
    code: 'safe-cleanup-available',
    message: 'Only safe, reproducible artifacts were found.',
  });
}
