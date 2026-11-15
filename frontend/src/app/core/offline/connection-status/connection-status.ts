import { Component, computed, inject } from '@angular/core';

import { Connectivity } from '../connectivity';
import { LotOutbox, PendingLot } from '../lot-outbox';

const SAVED_AT_FORMAT = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * estado de la conexión para el encabezado: un chip con ícono y texto, los lotes que esperan
 * para subirse (con "Sincronizar ahora") y los que el backend rechazó (con "Descartar")
 *
 * está pensado para la barra superior clara del marco. no tiene inputs: lee `Connectivity`
 * y `LotOutbox`
 */
@Component({
  selector: 'app-connection-status',
  styleUrl: './connection-status.css',
  templateUrl: './connection-status.html',
})
export class ConnectionStatus {
  protected readonly connectivity = inject(Connectivity);
  protected readonly outbox = inject(LotOutbox);

  /** igual que `Connectivity.backend`, separando "sin internet" de "el backend no responde" */
  protected readonly state = computed(() => {
    const backend = this.connectivity.backend();
    return backend === 'down' && !this.connectivity.online() ? 'offline' : backend;
  });

  protected readonly savedAt = computed(() => {
    const date = this.connectivity.cacheSavedAt();
    return date && this.connectivity.cacheServedAt() ? SAVED_AT_FORMAT.format(date) : null;
  });

  protected readonly waiting = computed(
    () => this.outbox.pending().filter((item) => !item.rejected).length,
  );
  protected readonly rejected = computed(() =>
    this.outbox.pending().filter((item) => item.rejected),
  );
  protected readonly canSync = computed(
    () => !this.outbox.syncing() && this.connectivity.backend() === 'up',
  );

  protected sync(): void {
    void this.outbox.sync();
  }

  protected discard(item: PendingLot): void {
    this.outbox.discard(item.localId);
  }
}
