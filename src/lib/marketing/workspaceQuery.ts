import {z} from 'zod';

export const workspaceQuerySchema=z.object({
 before:z.coerce.number().int().positive().safe().optional(),
 search:z.string().trim().max(100).default(''),
 filter:z.enum(['all','review','exceptions']).default('all'),
 listingBefore:z.coerce.number().int().positive().safe().optional(),
 listingSearch:z.string().trim().max(100).default(''),
}).strict();
export type WorkspaceQuery=z.input<typeof workspaceQuerySchema>;
/** Literal contains search; wildcard characters never expand the caller's query. */
export const containsPattern=(value:string)=>`%${value.replace(/[\\%_]/g,'\\$&')}%`;
