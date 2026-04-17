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
import type { Source } from './Source';

@Entity('pgwiki_source_fragments')
export class SourceFragment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  text!: string;

  @Column({ type: 'int', name: 'char_offset_start' })
  charOffsetStart!: number;

  @Column({ type: 'int', name: 'char_offset_end' })
  charOffsetEnd!: number;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne('Source', 'fragments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_id' })
  source!: Source;
}
