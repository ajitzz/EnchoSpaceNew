/** A successful provider read with no report is not a zero-spend report or a transport failure. */
export class ProviderReportPending extends Error {
  readonly code = 'PROVIDER_REPORT_PENDING';
  constructor(readonly reason: 'NO_REPORT' | 'NOT_STARTED') {
    super(reason === 'NOT_STARTED' ? 'The reporting window has not started.' : 'The provider has not returned a performance report.');
  }
}
