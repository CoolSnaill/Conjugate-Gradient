      integer function cgsolve(n, limit, tol, a, b, x0, xhist,
     &                         rhist, alpha, beta, steps, threshold,
     &                         minimum)
      implicit none
      integer n, limit, steps, i, j, k, it
      double precision tol, a(n,n), b(n), x0(n), xhist(n,0:limit)
      double precision rhist(0:limit), alpha(0:limit), beta(0:limit)
      double precision l(6,6), x(6), r(6), p(6), ap(6), direct(6)
      double precision minimum(n), y(6)
      double precision scale, pivot, acc, rr, next, curvature, step
      double precision ratio, threshold, bnorm, residual, cgnorm
      logical cgfinite

      steps = 0
      threshold = 0d0
      cgsolve = -3
      if (n.lt.2.or.n.gt.6.or.limit.lt.1.or.limit.gt.300) return
      if (.not.cgfinite(tol).or.tol.le.0d0.or.tol.ge.1d0) return
      scale = 0d0
      do i = 1, n
         if (.not.cgfinite(b(i)).or..not.cgfinite(x0(i))) return
         do j = 1, n
            if (.not.cgfinite(a(i,j))) return
            scale = max(scale,abs(a(i,j)))
         enddo
      enddo

      cgsolve = -1
      do i = 2, n
         do j = 1, i-1
            if (a(i,j).ne.a(j,i)) return
         enddo
      enddo

c     Check positive definiteness with a scaled Cholesky factorization.
      cgsolve = -2
      if (scale.eq.0d0) return
      do i = 1, n
         do j = 1, i
            pivot = a(i,j)/scale
            do k = 1, j-1
               pivot = pivot - l(i,k)*l(j,k)
            enddo
            if (i.eq.j) then
               if (pivot.le.0d0) return
               l(i,j) = sqrt(pivot)
            else
               l(i,j) = pivot/l(j,j)
            endif
         enddo
      enddo

c     Solve the triangular systems for the center of the level curves.
      do i = 1, n
         acc = b(i)/scale
         do j = 1, i-1
            acc = acc - l(i,j)*y(j)
         enddo
         y(i) = acc/l(i,i)
      enddo
      do i = n, 1, -1
         acc = y(i)
         do j = i+1, n
            acc = acc - l(j,i)*minimum(j)
         enddo
         minimum(i) = acc/l(i,i)
      enddo

      cgsolve = 2
      do i = 1, n
         x(i) = x0(i)
         xhist(i,0) = x(i)
      enddo
      call cgresidual(n,a,b,x,r)
      rr = 0d0
      do i = 1, n
         p(i) = r(i)
         rr = rr + r(i)*r(i)
      enddo
      bnorm = cgnorm(n,b)
      threshold = tol
      if (bnorm.gt.0d0) threshold = tol*bnorm
      residual = cgnorm(n,r)
      rhist(0) = residual
      alpha(0) = 0d0
      beta(0) = 0d0
      if (.not.cgfinite(bnorm).or..not.cgfinite(residual)) return
      if (residual.le.threshold) then
         cgsolve = 1
         return
      endif

      do it = 1, limit
         if (.not.cgfinite(rr).or.rr.le.0d0) return
         curvature = 0d0
         do i = 1, n
            acc = 0d0
            do j = 1, n
               acc = acc + a(i,j)*p(j)
            enddo
            ap(i) = acc
            curvature = curvature + p(i)*acc
         enddo
         if (.not.cgfinite(curvature).or.curvature.le.0d0) return
         step = rr/curvature
         if (.not.cgfinite(step).or.step.le.0d0) return
         next = 0d0
         do i = 1, n
            x(i) = x(i) + step*p(i)
            r(i) = r(i) - step*ap(i)
            if (.not.cgfinite(x(i)).or..not.cgfinite(r(i))) return
            next = next + r(i)*r(i)
         enddo

c        Measure the true residual for display and convergence testing.
         call cgresidual(n,a,b,x,direct)
         residual = cgnorm(n,direct)
         if (.not.cgfinite(residual)) return
         steps = it
         rhist(it) = residual
         alpha(it) = step
         beta(it) = 0d0
         do i = 1, n
            xhist(i,it) = x(i)
         enddo
         if (residual.le.threshold) then
            cgsolve = 1
            return
         endif
         if (it.eq.limit) goto 100
         if (.not.cgfinite(next)) return

c        Restart if roundoff made the recursive residual converge early.
         if (sqrt(next).le.threshold) then
            next = 0d0
            do i = 1, n
               r(i) = direct(i)
               p(i) = r(i)
               next = next + r(i)*r(i)
            enddo
         else
            ratio = next/rr
            if (.not.cgfinite(ratio)) return
            beta(it) = ratio
            do i = 1, n
               p(i) = r(i) + ratio*p(i)
            enddo
         endif
         rr = next
      enddo
  100 cgsolve = 0
      end

      subroutine cgresidual(n,a,b,x,r)
      implicit none
      integer n,i,j
      double precision a(n,n),b(n),x(n),r(n),ax
      do i = 1,n
         ax = 0d0
         do j = 1,n
            ax = ax + a(i,j)*x(j)
         enddo
         r(i) = b(i) - ax
      enddo
      end

      double precision function cgnorm(n,v)
      implicit none
      integer n,i
      double precision v(n), scale, acc
      logical cgfinite
      scale = 0d0
      do i = 1,n
         if (.not.cgfinite(v(i))) then
            cgnorm = v(i)
            return
         endif
         scale = max(scale,abs(v(i)))
      enddo
      acc = 0d0
      if (scale.gt.0d0) then
         do i = 1,n
            acc = acc + (v(i)/scale)*(v(i)/scale)
         enddo
      endif
      cgnorm = scale*sqrt(acc)
      end

      logical function cgfinite(value)
      implicit none
      double precision value
      cgfinite = abs(value).le.1.7976931348623157d308
      end
