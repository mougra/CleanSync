<template>
  <section class="insights-preview">
    <div class="preview-header">
      <div>
        <div class="page-tag">Инсайты</div>
        <h2>Новые советы и идеи</h2>
      </div>
      <router-link class="link-primary" to="/insights">Перейти к статье</router-link>
    </div>
    <div class="preview-grid">
      <div class="preview-card">
        <h3>Новые советы по холодильнику</h3>
        <p>Организуйте продукты удобно и увеличьте срок их хранения.</p>
      </div>
      <div class="preview-card">
        <h3>Мотивация на уборку</h3>
        <p>Как делать уборку без выгорания и с поддержкой привычки.</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.insights-preview {
  background: #ffffff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  padding: 1.5rem;
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.05);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-tag {
  display: inline-flex;
  padding: 0.45rem 0.9rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  font-weight: 700;
  font-size: 0.85rem;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.preview-card {
  background: #f8fbff;
  border-radius: 24px;
  padding: 1.25rem;
  min-height: 140px;
  display: grid;
  gap: 0.8rem;
  border: 1px solid rgba(59, 130, 246, 0.12);
}

.preview-card h3 {
  font-size: 1.05rem;
  color: #102a43;
}

.preview-card p {
  color: #475569;
  line-height: 1.7;
}

.link-primary {
  color: #3d68ff;
  font-weight: 700;
  text-decoration: none;
}

@media (max-width: 900px) {
  .preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>