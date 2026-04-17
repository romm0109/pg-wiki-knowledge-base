import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { SourceFragment } from './SourceFragment';

@Entity('pgwiki_sources')
export class Source {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar' })
  type!: 'text' | 'markdown' | 'html' | 'pdf' | 'url' | 'record';

  @Column({ type: 'jsonb', nullable: true, name: 'tenant' })
  tenant!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('SourceFragment', 'source')
  fragments!: SourceFragment[];
}
