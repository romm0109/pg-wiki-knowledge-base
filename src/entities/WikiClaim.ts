import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { WikiPage } from './WikiPage';

@Entity('pgwiki_wiki_claims')
export class WikiClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne('WikiPage', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page!: WikiPage;
}
