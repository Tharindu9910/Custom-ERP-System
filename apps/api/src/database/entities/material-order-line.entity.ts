import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('material_order_line')
export class MaterialOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  line_id: string;

  @Column({ type: 'uuid' })
  order_id: string;

  @Column({ type: 'uuid' })
  item_id: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'int' })
  unit_price: number;
}