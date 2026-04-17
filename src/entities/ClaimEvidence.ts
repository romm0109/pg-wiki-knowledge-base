import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { WikiClaim } from './WikiClaim';
import type { SourceFragment } from './SourceFragment';

@Entity('pgwiki_claim_evidence')
export class ClaimEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne('WikiClaim', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claim_id' })
  claim!: WikiClaim;

  @ManyToOne('SourceFragment', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fragment_id' })
  fragment!: SourceFragment;
}
