import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { HOME_PATH, RETURN_PARAM, safeReturnUrl } from '../../../core/auth/return-url';
import { Connectivity } from '../../../core/offline/connectivity';
import { Icon } from '../../../shared/ui/icon/icon';
import {
  AuthField,
  AuthFormErrors,
  FIELD_ORDER,
  NO_ERRORS,
  authFormErrors,
  emailError,
} from '../auth-form';

/**
 * /registrarse: nombre (opcional), mail y contraseña. la cuenta queda abierta al crearla y se
 * sigue a ?volver= o a Mi campo. las reglas de la contraseña son las de django: las valida el
 * backend y sus mensajes se muestran en el campo
 */
@Component({
  selector: 'app-register-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  templateUrl: './register-page.html',
  styleUrl: '../auth-page.css',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly connectivity = inject(Connectivity);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly back = safeReturnUrl(
    inject(ActivatedRoute).snapshot.queryParamMap.get(RETURN_PARAM),
  );

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput =
    viewChild.required<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly inputs = {
    name: this.nameInput,
    email: this.emailInput,
    password: this.passwordInput,
  };

  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly sending = signal(false);
  protected readonly errors = signal<AuthFormErrors>(NO_ERRORS);

  /** sin internet no se puede crear la cuenta: se avisa antes de que lo intente */
  protected readonly offline = computed(
    () => !this.connectivity.online() || this.connectivity.backend() === 'down',
  );
  /** el enlace a ingresar conserva la ruta a la que se vuelve */
  protected readonly switchParams = this.back ? { [RETURN_PARAM]: this.back } : {};

  /** ids que describen la contraseña: la ayuda siempre, el error si lo hay */
  protected readonly passwordDescription = computed(() =>
    this.errors().fields.password
      ? 'register-password-hint register-password-error'
      : 'register-password-hint',
  );

  protected edit(field: AuthField, value: string): void {
    this[field].set(value);
    this.clearError(field);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.sending()) return;
    const fields: AuthFormErrors['fields'] = {};
    const badEmail = emailError(this.email());
    if (badEmail) fields.email = badEmail;
    if (!this.password()) fields.password = 'Elegí una contraseña.';
    if (Object.keys(fields).length > 0) {
      this.fail({ fields, message: null });
      return;
    }

    this.errors.set(NO_ERRORS);
    this.sending.set(true);
    this.auth
      .register({ name: this.name(), email: this.email(), password: this.password() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => void this.router.navigateByUrl(this.back ?? HOME_PATH),
        error: (error: unknown) => {
          this.sending.set(false);
          this.fail(authFormErrors(error, 'crear la cuenta'));
        },
      });
  }

  private fail(errors: AuthFormErrors): void {
    this.errors.set(errors);
    // el foco va al primer campo con error; un error general lo anuncia su role="alert"
    const first = FIELD_ORDER.find((field) => errors.fields[field]);
    if (!first) return;
    afterNextRender(() => this.inputs[first]().nativeElement.focus(), {
      injector: this.injector,
    });
  }

  private clearError(field: AuthField): void {
    const current = this.errors();
    if (!current.fields[field]) return;
    const fields = { ...current.fields };
    delete fields[field];
    this.errors.set({ ...current, fields });
  }
}
